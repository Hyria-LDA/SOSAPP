package br.com.sosmarceneiros.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class SOSFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "matches";
    private static final String DEFAULT_PATH = "/app/notificacoes";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String title = firstNonBlank(data.get("title"), remoteMessage.getNotification() != null ? remoteMessage.getNotification().getTitle() : null, "Eba!");
        String body = firstNonBlank(data.get("body"), remoteMessage.getNotification() != null ? remoteMessage.getNotification().getBody() : null, "Voce recebeu uma nova notificacao.");
        String imageUrl = firstNonBlank(data.get("image_url"), data.get("imageUrl"), null);
        String path = firstNonBlank(data.get("path"), DEFAULT_PATH);

        showNotification(title, body, imageUrl, path);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    private void showNotification(String title, String body, String imageUrl, String path) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureChannel();

        Bitmap image = loadRemoteBitmap(imageUrl);
        Bitmap largeIcon = image != null ? circleCrop(image) : defaultLargeIcon();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setContentIntent(openAppIntent(path))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }

        if (image != null) {
            builder.setStyle(
                new NotificationCompat.BigPictureStyle()
                    .bigPicture(image)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(body)
            );
        }

        NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), builder.build());
    }

    private PendingIntent openAppIntent(String path) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("br.com.sosmarceneiros.app.PUSH_OPEN");
        intent.putExtra("sos_push_path", normalizePath(path));
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getActivity(this, 1207, intent, flags);
    }

    private String normalizePath(String path) {
        if (path == null || path.trim().isEmpty()) return DEFAULT_PATH;
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return path.startsWith("/") ? path : "/" + path;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.notification_channel_description));
        manager.createNotificationChannel(channel);
    }

    private Bitmap defaultLargeIcon() {
        return BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
    }

    private Bitmap loadRemoteBitmap(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme())) return null;

        HttpURLConnection connection = null;
        try {
            URL url = new URL(value);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(7000);
            connection.setDoInput(true);
            connection.connect();

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return null;

            try (InputStream input = connection.getInputStream()) {
                return BitmapFactory.decodeStream(input);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private Bitmap circleCrop(Bitmap source) {
        if (source == null) return null;
        int size = Math.min(source.getWidth(), source.getHeight());
        int left = (source.getWidth() - size) / 2;
        int top = (source.getHeight() - size) / 2;

        Bitmap square = Bitmap.createBitmap(source, left, top, size, size);
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Rect rect = new Rect(0, 0, size, size);
        RectF rectF = new RectF(rect);
        Path path = new Path();
        path.addOval(rectF, Path.Direction.CCW);
        canvas.clipPath(path);
        canvas.drawBitmap(square, rect, rect, paint);
        return output;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return "";
    }
}
