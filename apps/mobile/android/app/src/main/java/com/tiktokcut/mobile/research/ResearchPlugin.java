package com.tiktokcut.mobile.research;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanIntentResult;
import com.journeyapps.barcodescanner.ScanOptions;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

/**
 * 选品采集的 JS 桥：扫码 / 手动配对电脑、查询状态、开无障碍设置、在手机上直接发起采集。
 */
@CapacitorPlugin(name = "ProductResearch")
public class ResearchPlugin extends Plugin {
    private static final String DOUYIN_PACKAGE = "com.ss.android.ugc.aweme";
    private final OkHttpClient client = new OkHttpClient();

    @Override
    public void load() {
        ResearchEvents.setListener(new ResearchEvents.Listener() {
            @Override
            public void onState(String state) {
                JSObject data = new JSObject();
                data.put("connection", state);
                notifyListeners("state", data);
            }

            @Override
            public void onTask(JSONObject task) {
                try {
                    notifyListeners("task", JSObject.fromJSONObject(task));
                } catch (Exception ignored) {
                }
            }
        });
        if (PairingStore.isPaired(getContext())) startConnection(false);
    }

    @Override
    protected void handleOnDestroy() {
        ResearchEvents.setListener(null);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean paired = PairingStore.isPaired(getContext());
        JSObject result = new JSObject();
        result.put("paired", paired);
        result.put("endpoint", PairingStore.endpoint(getContext()));
        result.put("connection", paired ? ResearchEvents.connectionState() : "not_paired");
        result.put("accessibilityEnabled", DouyinAccessibilityService.isEnabled(getContext()));
        result.put("douyinInstalled", getContext().getPackageManager().getLaunchIntentForPackage(DOUYIN_PACKAGE) != null);
        JSONObject task = ResearchEvents.currentTask();
        if (task != null) {
            try {
                result.put("task", JSObject.fromJSONObject(task));
            } catch (Exception ignored) {
            }
        }
        call.resolve(result);
    }

    /* ---------------------------------------------------------------- 配对电脑 */

    @PluginMethod
    public void scanPairing(PluginCall call) {
        ScanOptions options = new ScanOptions();
        options.setPrompt("扫描电脑端「选品」页的配对二维码");
        options.setBeepEnabled(false);
        options.setOrientationLocked(false);
        Intent intent = new ScanContract().createIntent(getContext(), options);
        startActivityForResult(call, intent, "onScanResult");
    }

    @ActivityCallback
    private void onScanResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        ScanIntentResult scan = ScanIntentResult.parseActivityResult(activityResult.getResultCode(), activityResult.getData());
        if (scan.getContents() == null) {
            call.reject("已取消扫码", "CANCELLED");
            return;
        }
        try {
            JSONObject qr = new JSONObject(scan.getContents());
            pair(call, qr.getString("endpoint"), qr.getString("pairingCode"));
        } catch (Exception error) {
            call.reject("不是 TiktokCut 的配对二维码", "INVALID_QR");
        }
    }

    @PluginMethod
    public void pairManual(PluginCall call) {
        String endpoint = call.getString("endpoint", "").trim().replaceAll("/+$", "");
        String code = call.getString("pairingCode", "").trim();
        if (!endpoint.matches("^https?://.+")) {
            call.reject("服务地址需要以 http:// 开头", "INVALID_INPUT");
            return;
        }
        if (code.isEmpty()) {
            call.reject("请输入配对码", "INVALID_INPUT");
            return;
        }
        pair(call, endpoint, code);
    }

    private void pair(PluginCall call, String endpoint, String code) {
        try {
            String deviceId = PairingStore.installId(getContext());
            JSONObject payload = new JSONObject()
                .put("action", "pair")
                .put("pairingCode", code)
                .put("deviceId", deviceId)
                .put("deviceName", Build.MANUFACTURER + " " + Build.MODEL)
                .put("model", Build.MODEL);
            Request request = new Request.Builder()
                .url(endpoint + "/device")
                .post(RequestBody.create(payload.toString(), MediaType.get("application/json; charset=utf-8")))
                .build();
            ResearchEvents.state("pairing");
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call httpCall, IOException error) {
                    ResearchEvents.state("pair_failed");
                    call.reject("连不上电脑，请确认手机和电脑在同一 Wi-Fi", "NETWORK");
                }

                @Override
                public void onResponse(Call httpCall, Response response) throws IOException {
                    try (response) {
                        String body = response.body() == null ? "" : response.body().string();
                        if (!response.isSuccessful()) {
                            String detail = "HTTP " + response.code();
                            try {
                                String message = new JSONObject(body).optString("error");
                                if (!message.isEmpty()) detail = message;
                            } catch (Exception ignored) {
                            }
                            ResearchEvents.state("pair_failed");
                            call.reject("配对失败：" + detail, "PAIR_FAILED");
                            return;
                        }
                        JSONObject value = new JSONObject(body);
                        PairingStore.save(getContext(), endpoint, value.getString("token"), deviceId);
                        startConnection(true);
                        JSObject result = new JSObject();
                        result.put("endpoint", endpoint);
                        call.resolve(result);
                    } catch (Exception error) {
                        ResearchEvents.state("pair_failed");
                        call.reject("配对失败：" + error.getMessage(), "PAIR_FAILED");
                    }
                }
            });
        } catch (Exception error) {
            call.reject("配对失败：" + error.getMessage(), "PAIR_FAILED");
        }
    }

    @PluginMethod
    public void unpair(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ConnectionService.class));
        PairingStore.clear(getContext());
        ResearchEvents.state("not_paired");
        call.resolve();
    }

    private void startConnection(boolean reconnect) {
        Intent intent = new Intent(getContext(), ConnectionService.class);
        if (reconnect) intent.setAction(ConnectionService.ACTION_RECONNECT);
        try {
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (Exception error) {
            // Android refuses to start a foreground service from the background; it starts on the next app open.
            ResearchEvents.state("disconnected");
        }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /* ---------------------------------------------------------------- 手机上直接采集 */

    @PluginMethod
    public void startLocalTask(PluginCall call) {
        String keyword = call.getString("keyword", "").trim();
        if (keyword.isEmpty()) {
            call.reject("请输入搜索词", "INVALID_INPUT");
            return;
        }
        if (!DouyinAccessibilityService.isEnabled(getContext())) {
            call.reject("请先开启无障碍服务", "ACCESSIBILITY_OFF");
            return;
        }
        if (getContext().getPackageManager().getLaunchIntentForPackage(DOUYIN_PACKAGE) == null) {
            call.reject("手机上没有安装抖音", "DOUYIN_MISSING");
            return;
        }
        JSONObject running = ResearchEvents.currentTask();
        if (running != null && "running".equals(running.optString("status"))) {
            call.reject("已有采集任务在进行", "BUSY");
            return;
        }
        try {
            String taskId = "local-" + UUID.randomUUID();
            JSONObject task = new JSONObject()
                .put("id", taskId)
                .put("keyword", keyword)
                .put("targetCount", Math.max(1, Math.min(1000, call.getInt("targetCount", 50))))
                .put("sort", call.getString("sort", "sales"));
            ResearchEvents.markLocal(taskId);
            ResearchEvents.taskStarted(task, true);
            DouyinAccessibilityService.submitTask(task);
            JSObject result = new JSObject();
            result.put("taskId", taskId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void cancelTask(PluginCall call) {
        DouyinAccessibilityService.cancelTask(call.getString("taskId", ""));
        call.resolve();
    }

    /** Hands over (and forgets) every result collected by phone-side tasks since the last call. */
    @PluginMethod
    public void drainLocalResults(PluginCall call) {
        List<JSONObject> results = ResearchEvents.drainLocalResults();
        JSArray items = new JSArray();
        for (JSONObject item : results) items.put(item);
        JSObject response = new JSObject();
        response.put("results", items);
        call.resolve(response);
    }
}
