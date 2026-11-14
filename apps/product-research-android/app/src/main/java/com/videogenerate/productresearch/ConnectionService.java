package com.videogenerate.productresearch;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

public final class ConnectionService extends Service {
    static final String ACTION_RECONNECT = "com.videogenerate.productresearch.RECONNECT";
    static final String ACTION_STATE = "com.videogenerate.productresearch.STATE";
    static final String EXTRA_STATE = "state";
    private static final String CHANNEL_ID = "product_research_connection";
    private static final int NOTIFICATION_ID = 4101;
    private final OkHttpClient client = new OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build();
    private WebSocket socket;
    private boolean stopping;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        ServiceHolder.instance = this;
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Product Research Assistant")
            .setContentText("Waiting for desktop tasks")
            .setOngoing(true)
            .build());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_RECONNECT.equals(intent.getAction()) && socket != null) {
            socket.cancel();
            socket = null;
        }
        connect();
        return START_STICKY;
    }

    private void connect() {
        if (!PairingStore.isPaired(this) || socket != null) return;
        String endpoint = PairingStore.endpoint(this).replaceFirst("^http", "ws");
        String url = endpoint + "/ws?token=" + PairingStore.token(this);
        Request request = new Request.Builder().url(url).build();
        socket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                broadcastState("connected");
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                handleMessage(text);
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                webSocket.close(code, reason);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                socket = null;
                broadcastState("disconnected");
                reconnectLater();
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                socket = null;
                String detail = error.getMessage() == null ? "unknown" : error.getMessage();
                broadcastState("connection_failed:" + detail);
                reconnectLater();
            }
        });
    }

    private void handleMessage(String raw) {
        try {
            JSONObject message = new JSONObject(raw);
            String type = message.optString("type");
            if ("collect_task".equals(type)) {
                JSONObject task = message.getJSONObject("task");
                DouyinAccessibilityService.submitTask(task);
            } else if ("cancel_task".equals(type)) {
                DouyinAccessibilityService.cancelTask(message.optString("taskId"));
            }
        } catch (Exception error) {
            broadcastState("protocol_error");
        }
    }

    static void sendTaskEvent(String type, String taskId, String error, JSONObject result) {
        ConnectionService current = ServiceHolder.instance;
        if (current == null || current.socket == null) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", type);
            message.put("taskId", taskId);
            if (error != null) message.put("error", error);
            if (result != null) message.put("result", result);
            current.socket.send(message.toString());
        } catch (Exception ignored) {
        }
    }

    private void reconnectLater() {
        if (!stopping) handler.postDelayed(this::connect, 3000);
    }

    private void broadcastState(String state) {
        Intent intent = new Intent(ACTION_STATE).setPackage(getPackageName());
        intent.putExtra(EXTRA_STATE, state);
        sendBroadcast(intent);
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Desktop connection",
            NotificationManager.IMPORTANCE_LOW
        );
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        stopping = true;
        if (socket != null) socket.close(1000, "Service stopped");
        socket = null;
        ServiceHolder.instance = null;
        client.dispatcher().executorService().shutdown();
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        reconnectLater();
        super.onTaskRemoved(rootIntent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static final class ServiceHolder {
        private static ConnectionService instance;
    }
}
