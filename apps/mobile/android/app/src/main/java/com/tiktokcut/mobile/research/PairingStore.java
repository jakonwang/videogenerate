package com.tiktokcut.mobile.research;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

public final class PairingStore {
    private static final String FILE_NAME = "pairing";
    private static final String ENDPOINT = "endpoint";
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

    public static String endpoint(Context context) {
        return preferences(context).getString(ENDPOINT, "");
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
