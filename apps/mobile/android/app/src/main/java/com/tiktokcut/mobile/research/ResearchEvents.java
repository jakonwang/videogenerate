package com.tiktokcut.mobile.research;

import android.content.Context;
import android.content.Intent;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

/**
 * 选品采集的事件中心：连接状态、任务进度、本机任务的采集结果。
 *
 * 任务有两个来源：电脑端通过 WebSocket 下发（结果回传电脑），或手机 App 自己发起（结果交给 App 存到云端）。
 * 采集时抖音在前台、App 在后台，WebView 可能收不到实时事件，所以本机任务的结果先缓存在这里，
 * App 回到前台时再一次性取走。
 */
public final class ResearchEvents {
    public interface Listener {
        void onState(String state);

        void onTask(JSONObject task);
    }

    private static volatile Listener listener;
    private static volatile String connectionState = "not_paired";
    private static final Set<String> localTaskIds = ConcurrentHashMap.newKeySet();
    private static final List<JSONObject> localResults = new ArrayList<>();
    private static JSONObject currentTask;

    private ResearchEvents() {}

    public static void setListener(Listener value) {
        listener = value;
    }

    public static String connectionState() {
        return connectionState;
    }

    static void state(String value) {
        connectionState = value;
        Listener current = listener;
        if (current != null) current.onState(value);
    }

    /* ---------------------------------------------------------------- 任务 */

    static void markLocal(String taskId) {
        localTaskIds.add(taskId);
    }

    static boolean isLocal(String taskId) {
        return localTaskIds.contains(taskId);
    }

    static synchronized void taskStarted(JSONObject task, boolean local) {
        try {
            currentTask = new JSONObject()
                .put("id", task.optString("id"))
                .put("keyword", task.optString("keyword"))
                .put("targetCount", task.optInt("targetCount", 100))
                .put("collected", 0)
                .put("origin", local ? "local" : "desktop")
                .put("status", "running")
                .put("startedAt", System.currentTimeMillis());
        } catch (Exception ignored) {
            currentTask = null;
        }
        publish();
    }

    /** Records one collector event and tells the app. Local results are buffered until the app drains them. */
    static void taskEvent(String type, String taskId, String error, JSONObject result) {
        synchronized (ResearchEvents.class) {
            if (currentTask == null || !taskId.equals(currentTask.optString("id"))) {
                if (!"task_failed".equals(type)) return;
                try {
                    currentTask = new JSONObject().put("id", taskId).put("origin", isLocal(taskId) ? "local" : "desktop");
                } catch (Exception ignored) {
                    return;
                }
            }
            try {
                if ("result".equals(type)) {
                    currentTask.put("collected", currentTask.optInt("collected") + 1);
                    if (isLocal(taskId) && result != null) localResults.add(new JSONObject(result.toString()).put("taskId", taskId));
                } else if ("task_completed".equals(type)) {
                    currentTask.put("status", "completed").put("finishedAt", System.currentTimeMillis());
                } else if ("task_failed".equals(type)) {
                    currentTask.put("status", "failed").put("error", error == null ? "" : error).put("finishedAt", System.currentTimeMillis());
                }
            } catch (Exception ignored) {
            }
        }
        publish();
    }

    static synchronized JSONObject currentTask() {
        try {
            return currentTask == null ? null : new JSONObject(currentTask.toString());
        } catch (Exception ignored) {
            return null;
        }
    }

    static synchronized List<JSONObject> drainLocalResults() {
        List<JSONObject> copy = new ArrayList<>(localResults);
        localResults.clear();
        return copy;
    }

    private static void publish() {
        Listener current = listener;
        JSONObject snapshot = currentTask();
        if (current != null && snapshot != null) current.onTask(snapshot);
    }

    /** A finished phone-side task brings Klipmill back to the front so the user sees the results. */
    static void returnToApp(Context context) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        context.startActivity(launch);
    }
}
