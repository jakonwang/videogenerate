package com.tiktokcut.mobile.research;

import android.content.Context;
import android.net.Uri;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONObject;

/**
 * 连不上电脑时重新找电脑：先试配对时记下的所有地址，再扫手机所在网段（同一 WiFi 下 1~254）。
 * 只认配对过的那台电脑（serverId 一致），找到就换成新地址。必须在后台线程调用。
 */
final class DesktopFinder {
    private static final int DEFAULT_PORT = 41688;
    private static final int SCAN_THREADS = 48;
    private static final OkHttpClient PROBE = new OkHttpClient.Builder()
        .connectTimeout(700, TimeUnit.MILLISECONDS)
        .readTimeout(1200, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(false)
        .build();

    private DesktopFinder() {}

    /** 返回能连上的电脑地址（http://ip:port），找不到返回 null */
    static String find(Context context) {
        String serverId = PairingStore.serverId(context);
        List<String> known = PairingStore.endpoints(context);
        for (String endpoint : known) {
            if (matches(endpoint, serverId)) return endpoint;
        }
        int port = DEFAULT_PORT;
        if (!known.isEmpty()) {
            int parsed = Uri.parse(known.get(0)).getPort();
            if (parsed > 0) port = parsed;
        }
        return scan(port, serverId, known);
    }

    private static String scan(int port, String serverId, List<String> skip) {
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        for (String prefix : localPrefixes()) {
            for (int host = 1; host <= 254; host++) {
                String endpoint = "http://" + prefix + host + ":" + port;
                if (!skip.contains(endpoint)) candidates.add(endpoint);
            }
        }
        if (candidates.isEmpty()) return null;
        ExecutorService pool = Executors.newFixedThreadPool(SCAN_THREADS);
        ExecutorCompletionService<String> completion = new ExecutorCompletionService<>(pool);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (String endpoint : candidates) {
                futures.add(completion.submit(() -> matches(endpoint, serverId) ? endpoint : null));
            }
            for (int i = 0; i < futures.size(); i++) {
                Future<String> done = completion.poll(20, TimeUnit.SECONDS);
                if (done == null) break;
                String found = done.get();
                if (found != null) return found;
            }
        } catch (Exception ignored) {
        } finally {
            for (Future<String> future : futures) future.cancel(true);
            pool.shutdownNow();
        }
        return null;
    }

    private static boolean matches(String endpoint, String serverId) {
        Request request = new Request.Builder().url(endpoint + "/hello").get().build();
        try (Response response = PROBE.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) return false;
            JSONObject body = new JSONObject(response.body().string());
            if (!"klipmill-research".equals(body.optString("app"))) return false;
            // 旧版配对没记 serverId：任何 Klipmill 电脑都先接受，连上后令牌会再校验一次
            return serverId.isEmpty() || serverId.equals(body.optString("serverId"));
        } catch (Exception error) {
            return false;
        }
    }

    /** 手机当前局域网 IPv4 的前三段，如 "192.168.1." */
    private static List<String> localPrefixes() {
        LinkedHashSet<String> prefixes = new LinkedHashSet<>();
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                String name = network.getName() == null ? "" : network.getName().toLowerCase();
                // 移动数据（rmnet / ccmni）不在电脑所在的局域网里
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun")) continue;
                for (InetAddress address : Collections.list(network.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || !address.isSiteLocalAddress()) continue;
                    String ip = address.getHostAddress();
                    if (ip == null) continue;
                    int lastDot = ip.lastIndexOf('.');
                    if (lastDot > 0) prefixes.add(ip.substring(0, lastDot + 1));
                }
            }
        } catch (Exception ignored) {
        }
        return new ArrayList<>(prefixes);
    }
}
