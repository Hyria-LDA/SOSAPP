package br.com.sosmarceneiros.app;

import android.webkit.JavascriptInterface;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SOSPushBridge {
    private final MainActivity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public SOSPushBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public void register(String accessToken, String supabaseUrl, String anonKey) {
        activity.runOnUiThread(() -> {
            if (!activity.isTrustedWebHost()) {
                activity.emitSOSPushResult(false, "Origem do app nao autorizada para registrar notificacoes.");
                return;
            }

            if (isBlank(accessToken) || isBlank(supabaseUrl) || isBlank(anonKey)) {
                activity.emitSOSPushResult(false, "Sessao ou configuracao do Supabase ausente.");
                return;
            }

            activity.runWithNotificationPermission(
                () -> requestFirebaseToken(accessToken, supabaseUrl, anonKey),
                () -> activity.emitSOSPushResult(false, "Permissao de notificacao negada no Android.")
            );
        });
    }

    private void requestFirebaseToken(String accessToken, String supabaseUrl, String anonKey) {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || isBlank(task.getResult())) {
                activity.emitSOSPushResult(false, "Firebase nao retornou token de notificacao.");
                return;
            }

            String fcmToken = task.getResult();
            executor.execute(() -> saveToken(accessToken, supabaseUrl, anonKey, fcmToken));
        });
    }

    private void saveToken(String accessToken, String supabaseUrl, String anonKey, String fcmToken) {
        HttpURLConnection connection = null;
        try {
            String endpoint = trimTrailingSlash(supabaseUrl) + "/rest/v1/rpc/register_push_token";
            URL url = new URL(endpoint);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", anonKey);
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);

            String body = "{\"p_token\":\"" + escapeJson(fcmToken) + "\",\"p_platform\":\"android\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);

            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) {
                activity.emitSOSPushResult(true, "Notificacoes ativadas neste celular.");
            } else {
                activity.emitSOSPushResult(false, "Supabase recusou o token de notificacao. Codigo " + status + ".");
            }
        } catch (Exception error) {
            activity.emitSOSPushResult(false, "Erro ao salvar token: " + error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String trimTrailingSlash(String value) {
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String escapeJson(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }
}
