package br.com.sosmarceneiros.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final int PUSH_PERMISSION_REQUEST_CODE = 4507;
    private Runnable pendingPushPermissionGranted;
    private Runnable pendingPushPermissionDenied;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalBrowserPlugin.class);
        registerPlugin(PushNotificationsPlugin.class);
        registerPlugin(SocialLoginPlugin.class);
        super.onCreate(savedInstanceState);
        clearWebViewCache();
        installSOSPushBridge();
        forceGoogleOAuthOutsideWebView();
        openAuthCallbackInWebView(getIntent());
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openAuthCallbackInWebView(intent);
    }

    void runWithNotificationPermission(Runnable onGranted, Runnable onDenied) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            onGranted.run();
            return;
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            onGranted.run();
            return;
        }

        pendingPushPermissionGranted = onGranted;
        pendingPushPermissionDenied = onDenied;
        requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PUSH_PERMISSION_REQUEST_CODE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PUSH_PERMISSION_REQUEST_CODE) return;

        Runnable onGranted = pendingPushPermissionGranted;
        Runnable onDenied = pendingPushPermissionDenied;
        pendingPushPermissionGranted = null;
        pendingPushPermissionDenied = null;

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted && onGranted != null) {
            onGranted.run();
        } else if (!granted && onDenied != null) {
            onDenied.run();
        }
    }

    private void forceGoogleOAuthOutsideWebView() {
        if (getBridge() == null) return;

        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (shouldOpenInExternalBrowser(url)) {
                    openInExternalBrowser(withNativeCallback(url));
                    return true;
                }

                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    private void clearWebViewCache() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().clearCache(true);
    }

    private void installSOSPushBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().addJavascriptInterface(new SOSPushBridge(this), "SOSPush");
    }

    boolean isTrustedWebHost() {
        if (getBridge() == null || getBridge().getWebView() == null) return false;
        String currentUrl = getBridge().getWebView().getUrl();
        if (currentUrl == null) return false;

        Uri uri = Uri.parse(currentUrl);
        String host = uri.getHost();
        return "sosmarceneiros.com.br".equalsIgnoreCase(host)
            || "www.sosmarceneiros.com.br".equalsIgnoreCase(host)
            || "sosapp-murex.vercel.app".equalsIgnoreCase(host);
    }

    void emitSOSPushResult(boolean ok, String message) {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;

            String safeMessage = message == null ? "" : message
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ");

            String script =
                "window.dispatchEvent(new CustomEvent('sos-push-result', { detail: { ok: "
                    + ok
                    + ", message: '"
                    + safeMessage
                    + "' } }));";

            getBridge().getWebView().evaluateJavascript(script, null);
        });
    }

    private boolean shouldOpenInExternalBrowser(Uri url) {
        if (url == null) return false;

        String host = url.getHost();
        String path = url.getPath();
        String query = url.getQuery();

        if ("accounts.google.com".equalsIgnoreCase(host)) return true;

        boolean isSupabaseAuth =
            "yzbfjqeltqgqpqecmwdv.supabase.co".equalsIgnoreCase(host) &&
            path != null &&
            path.startsWith("/auth/v1/authorize");

        return isSupabaseAuth && query != null && query.contains("provider=google");
    }

    private Uri withNativeCallback(Uri url) {
        if (url == null) return null;

        String host = url.getHost();
        String path = url.getPath();
        String query = url.getQuery();
        boolean isSupabaseGoogleAuth =
            "yzbfjqeltqgqpqecmwdv.supabase.co".equalsIgnoreCase(host) &&
            path != null &&
            path.startsWith("/auth/v1/authorize") &&
            query != null &&
            query.contains("provider=google");

        if (!isSupabaseGoogleAuth) return url;

        String redirectTo = url.getQueryParameter("redirect_to");
        if (redirectTo == null || redirectTo.trim().isEmpty()) return url;

        Uri redirectUri = Uri.parse(redirectTo);
        if (
            "1".equals(redirectUri.getQueryParameter("from_app")) ||
            "1".equals(redirectUri.getQueryParameter("native"))
        ) {
            return url;
        }

        Uri nativeRedirect = redirectUri.buildUpon()
            .appendQueryParameter("from_app", "1")
            .build();

        Uri.Builder builder = url.buildUpon().clearQuery();
        for (String name : url.getQueryParameterNames()) {
            if ("redirect_to".equals(name)) {
                builder.appendQueryParameter(name, nativeRedirect.toString());
                continue;
            }

            for (String value : url.getQueryParameters(name)) {
                builder.appendQueryParameter(name, value);
            }
        }

        return builder.build();
    }

    private void openInExternalBrowser(Uri url) {
        if (url == null) return;

        Intent chromeIntent = new Intent(Intent.ACTION_VIEW, url);
        chromeIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        chromeIntent.setPackage("com.android.chrome");

        try {
            startActivity(chromeIntent);
        } catch (Exception chromeError) {
            Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, url);
            fallbackIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(fallbackIntent);
        }
    }

    private void openAuthCallbackInWebView(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri data = intent.getData();
        boolean isAuthCallback =
            "sosmarceneiros".equalsIgnoreCase(data.getScheme()) &&
            "auth-callback".equalsIgnoreCase(data.getHost());

        if (!isAuthCallback) return;

        Uri.Builder callback = Uri.parse("https://sosmarceneiros.com.br/auth/callback").buildUpon();
        String query = data.getEncodedQuery();
        String fragment = data.getEncodedFragment();

        if (query != null && !query.trim().isEmpty()) {
            callback.encodedQuery(query);
        }
        if (fragment != null && !fragment.trim().isEmpty()) {
            callback.encodedFragment(fragment);
        }

        String callbackUrl = callback.build().toString();
        if (getBridge() == null || getBridge().getWebView() == null) {
            getWindow()
                .getDecorView()
                .postDelayed(() -> openAuthCallbackInWebView(intent), 300);
            return;
        }

        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(callbackUrl));
    }
}
