package com.tiktokcut.mobile.research;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

public final class PairingStore {
    private static final String FILE_NAME = "pairing";
    private static final String ENDPOINT = "endpoint";
    private static final String ENDPOINTS = "endpoints";
    private static final String SERVER_ID = "server_id";
    private static final String TOKEN = "token";
    private static final String DEVICE_ID = "device_id";
    private static final String INSTALL_FILE_NAME = "install";
    private static final String INSTALL_ID = "install_id";

    private PairingStore() {}

    public static void save(Context context, String endpoint, String token, String deviceId) {
        preferences(context).edit()
            .putString(ENDPOINT, endpoint)
            .putString(TOKEN, token)
            .putString(DEVICE_ID, deviceId)
            .apply();
    }

    /** 电脑的固定标识和它所有局域网地址：电脑换 IP 后手机靠这些自动重新找到电脑 */
    public static void saveServer(Context context, String serverId, List<String> endpoints) {
        SharedPreferences.Editor editor = preferences(context).edit();
        if (serverId != null && !serverId.isEmpty()) editor.putString(SERVER_ID, serverId);
        if (endpoints != null && !endpoints.isEmpty()) editor.putString(ENDPOINTS, String.join("\n", endpoints));
        editor.apply();
    }

    /** 换到新地址（自动重新找到电脑后） */
    public static void updateEndpoint(Context context, String endpoint) {
        preferences(context).edit().putString(ENDPOINT, endpoint).apply();
    }

    public static String endpoint(Context context) {
        return preferences(context).getString(ENDPOINT, "");
    }

    /** 当前地址在前，其后是配对时电脑报的其他地址 */
    public static List<String> endpoints(Context context) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        String current = endpoint(context);
        if (!current.isEmpty()) values.add(current);
        for (String item : preferences(context).getString(ENDPOINTS, "").split("\n")) {
            if (!item.trim().isEmpty()) values.add(item.trim());
        }
        return new ArrayList<>(values);
    }

    public static String serverId(Context context) {
        return preferences(context).getString(SERVER_ID, "");
    }

    public static String token(Context context) {
        return preferences(context).getString(TOKEN, "");
    }

    public static String deviceId(Context context) {
        return preferences(context).getString(DEVICE_ID, "");
    }

    /** Stable per-install id, kept across unpairing so the desktop does not accumulate duplicate devices. */
    public static String installId(Context context) {
        SharedPreferences install = context.getSharedPreferences(INSTALL_FILE_NAME, Context.MODE_PRIVATE);
        String value = install.getString(INSTALL_ID, "");
        if (value.isEmpty()) {
            value = UUID.randomUUID().toString();
            install.edit().putString(INSTALL_ID, value).apply();
        }
        return value;
    }

    public static boolean isPaired(Context context) {
        return !endpoint(context).isEmpty() && !token(context).isEmpty() && !deviceId(context).isEmpty();
    }

    public static void clear(Context context) {
        preferences(context).edit().clear().apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
    }
}
