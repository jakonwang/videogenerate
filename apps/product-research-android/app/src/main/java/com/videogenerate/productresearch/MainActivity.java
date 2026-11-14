package com.videogenerate.productresearch;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;
import java.io.IOException;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

public final class MainActivity extends AppCompatActivity {
    private final OkHttpClient client = new OkHttpClient();
    private TextView connectionState;
    private TextView endpointState;
    private TextView accessibilityState;
    private Button scanButton;
    private boolean receiverRegistered;

    private final ActivityResultLauncher<ScanOptions> scanner = registerForActivityResult(
        new ScanContract(),
        result -> {
            if (result.getContents() != null) pair(result.getContents());
        }
    );

    private final BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ConnectionService.ACTION_STATE.equals(intent.getAction())) {
                renderConnection(intent.getStringExtra(ConnectionService.EXTRA_STATE));
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildContent());
        requestNotificationPermission();
        if (PairingStore.isPaired(this)) startConnectionService();
    }

    @Override
    protected void onResume() {
        super.onResume();
        renderAccessibility();
        renderConnection(PairingStore.isPaired(this) ? "connecting" : "not_paired");
        IntentFilter filter = new IntentFilter(ConnectionService.ACTION_STATE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(stateReceiver, filter);
        }
        receiverRegistered = true;
    }

    @Override
    protected void onPause() {
        if (receiverRegistered) unregisterReceiver(stateReceiver);
        receiverRegistered = false;
        super.onPause();
    }

    private LinearLayout buildContent() {
        int padding = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(padding, padding, padding, padding);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.rgb(9, 18, 30));

        TextView title = text("\u9009\u54c1\u52a9\u624b", 28, Color.WHITE);
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth(dp(64)));

        TextView description = text(
            "\u626b\u7801\u8fde\u63a5\u7535\u8111\uff0c\u63a5\u6536\u9009\u54c1\u4efb\u52a1\u5e76\u56de\u4f20\u5546\u54c1\u6570\u636e\u3002",
            15,
            Color.rgb(165, 180, 200)
        );
        description.setGravity(Gravity.CENTER);
        root.addView(description, fullWidth(dp(72)));

        connectionState = statusView();
        endpointState = statusView();
        accessibilityState = statusView();
        root.addView(connectionState, fullWidth(dp(64)));
        root.addView(endpointState, fullWidth(dp(54)));
        root.addView(accessibilityState, fullWidth(dp(64)));

        scanButton = button("\u626b\u63cf\u7535\u8111\u4e8c\u7ef4\u7801");
        scanButton.setOnClickListener(view -> openScanner());
        root.addView(scanButton, fullWidth(dp(54)));

        Button accessibilityButton = button("\u5f00\u542f\u65e0\u969c\u788d\u6267\u884c\u670d\u52a1");
        accessibilityButton.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(accessibilityButton, fullWidth(dp(54)));

        Button disconnectButton = button("\u89e3\u9664\u5f53\u524d\u914d\u5bf9");
        disconnectButton.setOnClickListener(view -> {
            stopService(new Intent(this, ConnectionService.class));
            PairingStore.clear(this);
            renderConnection("not_paired");
        });
        root.addView(disconnectButton, fullWidth(dp(54)));
        return root;
    }

    private void openScanner() {
        ScanOptions options = new ScanOptions();
        options.setPrompt("Scan the QR code shown on the desktop");
        options.setBeepEnabled(false);
        options.setOrientationLocked(false);
        scanner.launch(options);
    }

    private void pair(String raw) {
        scanButton.setEnabled(false);
        renderConnection("pairing");
        try {
            JSONObject qr = new JSONObject(raw);
            String endpoint = qr.getString("endpoint");
            String code = qr.getString("pairingCode");
            JSONObject payload = new JSONObject();
            payload.put("code", code);
            payload.put("name", Build.MANUFACTURER + " " + Build.MODEL);
            Request request = new Request.Builder()
                .url(endpoint + "/pair")
                .post(RequestBody.create(payload.toString(), MediaType.get("application/json; charset=utf-8")))
                .build();
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException error) {
                    runOnUiThread(() -> showPairingError(error.getMessage()));
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    try (response) {
                        if (!response.isSuccessful() || response.body() == null) {
                            runOnUiThread(() -> showPairingError("HTTP " + response.code()));
                            return;
                        }
                        JSONObject value = new JSONObject(response.body().string());
                        PairingStore.save(
                            MainActivity.this,
                            endpoint,
                            value.getString("token"),
                            value.getString("deviceId")
                        );
                        runOnUiThread(() -> {
                            scanButton.setEnabled(true);
                            startConnectionService(true);
                            renderConnection("connecting");
                        });
                    } catch (Exception error) {
                        runOnUiThread(() -> showPairingError(error.getMessage()));
                    }
                }
            });
        } catch (Exception error) {
            showPairingError(error.getMessage());
        }
    }

    private void showPairingError(String detail) {
        scanButton.setEnabled(true);
        renderConnection("pair_failed");
        Toast.makeText(this, detail == null ? "Pairing failed" : detail, Toast.LENGTH_LONG).show();
    }

    private void startConnectionService() {
        startConnectionService(false);
    }

    private void startConnectionService(boolean reconnect) {
        Intent intent = new Intent(this, ConnectionService.class);
        if (reconnect) intent.setAction(ConnectionService.ACTION_RECONNECT);
        ContextCompat.startForegroundService(this, intent);
    }

    private void renderConnection(String state) {
        String label;
        int color;
        if ("connected".equals(state)) {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u5df2\u8fde\u63a5";
            color = Color.rgb(72, 220, 178);
        } else if ("not_paired".equals(state)) {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u672a\u914d\u5bf9";
            color = Color.rgb(255, 186, 73);
        } else if (state != null && state.startsWith("connection_failed:")) {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u626b\u7801";
            color = Color.rgb(255, 120, 120);
        } else if ("disconnected".equals(state)) {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u5df2\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u8fde";
            color = Color.rgb(255, 186, 73);
        } else if ("pair_failed".equals(state) || "protocol_error".equals(state)) {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u914d\u5bf9\u5931\u8d25";
            color = Color.rgb(255, 120, 120);
        } else {
            label = "\u7535\u8111\u8fde\u63a5\uff1a\u6b63\u5728\u8fde\u63a5";
            color = Color.rgb(126, 190, 255);
        }
        connectionState.setText(label);
        connectionState.setTextColor(color);
        String endpoint = PairingStore.endpoint(this);
        endpointState.setText(endpoint.isEmpty()
            ? "\u7535\u8111\u5730\u5740\uff1a\u672a\u8bbe\u7f6e"
            : "\u7535\u8111\u5730\u5740\uff1a" + endpoint);
        endpointState.setTextColor(Color.rgb(165, 180, 200));
    }

    private void renderAccessibility() {
        boolean enabled = DouyinAccessibilityService.isEnabled(this);
        accessibilityState.setText(enabled
            ? "\u81ea\u52a8\u6267\u884c\uff1a\u5df2\u5f00\u542f"
            : "\u81ea\u52a8\u6267\u884c\uff1a\u672a\u5f00\u542f");
        accessibilityState.setTextColor(enabled ? Color.rgb(72, 220, 178) : Color.rgb(255, 186, 73));
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }
    }

    private TextView statusView() {
        TextView view = text("", 16, Color.WHITE);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(dp(16), 0, dp(16), 0);
        view.setBackgroundColor(Color.rgb(20, 34, 50));
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(15);
        button.setAllCaps(false);
        LinearLayout.LayoutParams params = fullWidth(dp(54));
        params.topMargin = dp(12);
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams fullWidth(int height) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
