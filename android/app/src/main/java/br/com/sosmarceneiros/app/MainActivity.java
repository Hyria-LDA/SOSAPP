package br.com.sosmarceneiros.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;
import co.boundstate.BranchDeepLinks;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final int PUSH_PERMISSION_REQUEST_CODE = 4507;
    private Runnable pendingPushPermissionGranted;
    private Runnable pendingPushPermissionDenied;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BranchDeepLinks.class);
        super.onCreate(savedInstanceState);
        // O BridgeActivity aplica o tema sem ActionBar durante super.onCreate().
        // Ativar antes disso pode criar uma barra nativa com o nome do app.
        EdgeToEdge.enable(this);
        installSOSPushBridge();
        openPushPathInWebView(getIntent());
        if (savedInstanceState == null) {
            openHomeOnLauncherIntent(getIntent());
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
        openPushPathInWebView(intent);
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

    private void openPushPathInWebView(Intent intent) {
        if (intent == null || !intent.hasExtra("sos_push_path")) return;

        String path = intent.getStringExtra("sos_push_path");
        if (path == null || path.trim().isEmpty()) path = "/app/notificacoes";

        String targetUrl;
        if (path.startsWith("https://www.sosmarceneiros.com.br")) {
            targetUrl = path;
        } else if (path.startsWith("https://sosmarceneiros.com.br")) {
            targetUrl = path.replaceFirst("https://sosmarceneiros.com.br", "https://www.sosmarceneiros.com.br");
        } else if (path.startsWith("http://") || path.startsWith("https://")) {
            targetUrl = "https://www.sosmarceneiros.com.br/app/notificacoes";
        } else {
            targetUrl = "https://www.sosmarceneiros.com.br" + (path.startsWith("/") ? path : "/" + path);
        }

        if (getBridge() == null || getBridge().getWebView() == null) {
            getWindow()
                .getDecorView()
                .postDelayed(() -> openPushPathInWebView(intent), 300);
            return;
        }

        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(targetUrl));
    }

    private void openHomeOnLauncherIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_MAIN.equals(intent.getAction())) return;
        if (intent.getData() != null) return;
        if (intent.hasExtra("sos_push_path")) return;

        String homeUrl = "https://www.sosmarceneiros.com.br/app";
        if (getBridge() == null || getBridge().getWebView() == null) {
            getWindow()
                .getDecorView()
                .postDelayed(() -> openHomeOnLauncherIntent(intent), 300);
            return;
        }

        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(homeUrl));
    }
}
