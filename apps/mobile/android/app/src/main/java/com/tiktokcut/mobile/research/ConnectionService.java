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
    /** 电脑认不出这台手机（电脑上删了设备 / 换了电脑）：别再重连，要重新扫码 */
    private static final int CLOSE_INVALID_CREDENTIALS = 4003;
    private WebSocket socket;
    private boolean stopping;
    private boolean searching;
    private int failures;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        ServiceHolder.instance = this;
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("正在连接电脑…"));
    }

    private android.app.Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Klipmill 选品连接")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private void updateNotification(String text) {
        try {
            getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification(text));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_RECONNECT.equals(intent.getAction())) {
            failures = 0;
            if (socket != null) {
                socket.cancel();
                socket = null;
            }
        }
        connect();
        return START_STICKY;
    }

    private void connect() {
        if (!PairingStore.isPaired(this) || socket != null || searching) return;
        String endpoint = PairingStore.endpoint(this).replaceFirst("^http", "ws");
        String url = endpoint + "/ws?deviceId=" + Uri.encode(PairingStore.deviceId(this))
            + "&token=" + Uri.encode(PairingStore.token(this));
        Request request = new Request.Builder().url(url).build();
        socket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                failures = 0;
                broadcastState("connected");
                updateNotification("已连接电脑，等待采集任务");
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
                if (socket == webSocket) socket = null;
                if (code == CLOSE_INVALID_CREDENTIALS) {
                    broadcastState("pair_invalid");
                    updateNotification("电脑已不认这台手机，请在 App 里重新扫码配对");
                    return;
                }
                broadcastState("disconnected");
                reconnectLater();
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                if (socket != webSocket && socket != null) return;
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

    /**
     * 连不上时：头两次直接重试（电脑刚重启、WiFi 抖一下）；之后在局域网里重新找电脑
     * （电脑或手机换了 IP 也能自己连回去），间隔逐步拉长到 30 秒。
     */
    private void reconnectLater() {
        if (stopping) return;
        failures++;
        updateNotification("和电脑断开了，正在重新连接…");
        long delay = Math.min(30_000L, 3_000L * failures);
        if (failures < 2) {
            handler.postDelayed(this::connect, delay);
            return;
        }
        handler.postDelayed(this::searchDesktop, delay);
    }

    private void searchDesktop() {
        if (stopping || searching || socket != null || !PairingStore.isPaired(this)) return;
        searching = true;
        broadcastState("searching");
        updateNotification("正在局域网里找电脑…");
        new Thread(() -> {
            String found = null;
            try {
                found = DesktopFinder.find(getApplicationContext());
            } catch (Exception ignored) {
            }
            String endpoint = found;
            handler.post(() -> {
                searching = false;
                if (stopping) return;
                if (endpoint != null) {
                    if (!endpoint.equals(PairingStore.endpoint(this))) PairingStore.updateEndpoint(this, endpoint);
                    connect();
                } else {
                    broadcastState("desktop_not_found");
                    updateNotification("没找到电脑：请确认电脑上的 Klipmill 已打开，并和手机连同一个 WiFi");
                    reconnectLater();
                }
            });
        }, "klipmill-desktop-finder").start();
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
