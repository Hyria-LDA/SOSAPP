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
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
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

        RemoteViews compactView = buildCompactNotificationView(title, body, imageUrl);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setContentIntent(openAppIntent(path))
            .setCustomContentView(compactView)
            .setCustomBigContentView(compactView)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle());

        NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), builder.build());
    }

    private RemoteViews buildCompactNotificationView(String title, String body, String imageUrl) {
        RemoteViews view = new RemoteViews(getPackageName(), R.layout.notification_sos_compact);
        view.setTextViewText(R.id.sos_notification_title, title);
        view.setTextViewText(R.id.sos_notification_body, body);

        Bitmap image = loadRemoteBitmap(imageUrl);
        if (image == null) {
            image = defaultLargeIcon();
        }

        Bitmap roundedImage = roundedSquare(image, dpToPx(64), dpToPx(12));
        if (roundedImage != null) {
            view.setImageViewBitmap(R.id.sos_notification_image, roundedImage);
        }

        return view;
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

    private Bitmap roundedSquare(Bitmap source, int targetSize, int cornerRadius) {
        if (source == null) return null;
        int sourceWidth = source.getWidth();
        int sourceHeight = source.getHeight();
        if (sourceWidth <= 0 || sourceHeight <= 0) return null;

        float sourceRatio = (float) sourceWidth / (float) sourceHeight;
        int cropWidth = sourceWidth;
        int cropHeight = sourceHeight;
        int cropLeft = 0;
        int cropTop = 0;

        if (sourceRatio > 1f) {
            cropWidth = sourceHeight;
            cropLeft = (sourceWidth - cropWidth) / 2;
        } else if (sourceRatio < 1f) {
            cropHeight = sourceWidth;
            cropTop = (sourceHeight - cropHeight) / 2;
        }

        Rect sourceRect = new Rect(cropLeft, cropTop, cropLeft + cropWidth, cropTop + cropHeight);
        RectF targetRect = new RectF(0, 0, targetSize, targetSize);
        Bitmap output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawRoundRect(targetRect, cornerRadius, cornerRadius, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(source, sourceRect, targetRect, paint);
        paint.setXfermode(null);
        return output;
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return "";
    }
}
