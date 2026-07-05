package br.com.sosmarceneiros.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExternalBrowserPlugin.class);
        registerPlugin(SocialLoginPlugin.class);
        super.onCreate(savedInstanceState);
        forceGoogleOAuthOutsideWebView();
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

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
        if ("1".equals(redirectUri.getQueryParameter("native"))) return url;

        Uri nativeRedirect = redirectUri.buildUpon()
            .appendQueryParameter("native", "1")
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
}
