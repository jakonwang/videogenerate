package com.tiktokcut.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.tiktokcut.mobile.publish.PublishPlugin;
import com.tiktokcut.mobile.research.ResearchPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ResearchPlugin.class);
        registerPlugin(PublishPlugin.class);
        super.onCreate(savedInstanceState);
        // The desktop connection runs as a foreground service, which needs a visible notification.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }
    }
}
