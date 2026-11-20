package com.tiktokcut.mobile.research;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.net.Uri;
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
    public static final String ACTION_RECONNECT = "com.tiktokcut.mobile.research.RECONNECT";
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
            .setContentTitle("Vidloom 选品连接")
            .setContentText("已连接电脑，等待采集任务")
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
        String url = endpoint + "/ws?deviceId=" + Uri.encode(PairingStore.deviceId(this))
            + "&token=" + Uri.encode(PairingStore.token(this));
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
                ResearchEvents.taskStarted(task, false);
                DouyinAccessibilityService.submitTask(task);
            } else if ("cancel_task".equals(type)) {
                DouyinAccessibilityService.cancelTask(message.optString("taskId"));
            }
        } catch (Exception error) {
            broadcastState("protocol_error");
        }
    }

    /** Routes a collector event: phone-started tasks go to the app, desktop tasks go back over the socket. */
    static void sendTaskEvent(String type, String taskId, String error, JSONObject result) {
        ResearchEvents.taskEvent(type, taskId, error, result);
        if (ResearchEvents.isLocal(taskId)) return;
        ConnectionService current = ServiceHolder.instance;
        if (current == null || current.socket == null) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", desktopEventType(type));
            message.put("taskId", taskId);
            if (error != null) message.put("error", error);
            if (result != null) message.put("result", result);
            current.socket.send(message.toString());
        } catch (Exception ignored) {
        }
    }

    /** Maps internal task events to the message types the desktop product-research service handles. */
    private static String desktopEventType(String type) {
        switch (type) {
            case "task_started": return "task_progress";
            case "result": return "task_result";
            case "task_completed": return "task_complete";
            case "task_failed": return "task_error";
            default: return type;
        }
    }

    private void reconnectLater() {
        if (!stopping) handler.postDelayed(this::connect, 3000);
    }

    private void broadcastState(String state) {
        ResearchEvents.state(state);
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "电脑连接",
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
