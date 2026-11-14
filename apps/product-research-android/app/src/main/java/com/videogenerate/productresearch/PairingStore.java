package com.videogenerate.productresearch;

import android.content.Context;
import android.content.SharedPreferences;

final class PairingStore {
    private static final String FILE_NAME = "pairing";
    private static final String ENDPOINT = "endpoint";
    private static final String TOKEN = "token";
    private static final String DEVICE_ID = "device_id";

    private PairingStore() {}

    static void save(Context context, String endpoint, String token, String deviceId) {
        preferences(context).edit()
            .putString(ENDPOINT, endpoint)
            .putString(TOKEN, token)
            .putString(DEVICE_ID, deviceId)
            .apply();
    }

    static String endpoint(Context context) {
        return preferences(context).getString(ENDPOINT, "");
    }

    static String token(Context context) {
        return preferences(context).getString(TOKEN, "");
    }

    static boolean isPaired(Context context) {
        return !endpoint(context).isEmpty() && !token(context).isEmpty();
    }

    static void clear(Context context) {
        preferences(context).edit().clear().apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
    }
}
