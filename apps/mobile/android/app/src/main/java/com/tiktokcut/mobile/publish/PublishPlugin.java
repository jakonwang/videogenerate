package com.tiktokcut.mobile.publish;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * 发布中心的原生能力：把云端视频保存到相册，或交给 TikTok / 抖音（系统分享）发布。
 * 视频按 fileId 缓存在 App 缓存目录，同一条视频不重复下载。
 */
@CapacitorPlugin(name = "Publish")
public class PublishPlugin extends Plugin {
    private static final String[] TIKTOK_PACKAGES = { "com.zhiliaoapp.musically", "com.ss.android.ugc.trill" };
    private static final String DOUYIN_PACKAGE = "com.ss.android.ugc.aweme";
    private final OkHttpClient client = new OkHttpClient();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void installedTargets(PluginCall call) {
        JSObject result = new JSObject();
        result.put("tiktok", installedTikTok() != null);
        result.put("douyin", isInstalled(DOUYIN_PACKAGE));
        call.resolve(result);
    }

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        executor.execute(() -> {
            try {
                String mime = mimeOf(call);
                File video = download(call);
                String name = "Vidloom_" + System.currentTimeMillis() + extOf(mime);
                Uri saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? saveWithMediaStore(video, name, mime) : saveLegacy(video, name, mime);
                JSObject result = new JSObject();
                result.put("uri", saved == null ? "" : saved.toString());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("保存失败：" + error.getMessage());
            }
        });
    }

    /** target: tiktok | douyin | any。TikTok / 抖音没装时退回系统分享面板 */
    @PluginMethod
    public void share(PluginCall call) {
        executor.execute(() -> {
            try {
                File video = download(call);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", video);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mimeOf(call));
                send.putExtra(Intent.EXTRA_STREAM, uri);
                String caption = call.getString("caption", "");
                if (caption != null && !caption.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, caption);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                String target = call.getString("target", "any");
                String pkg = "tiktok".equals(target) ? installedTikTok() : "douyin".equals(target) && isInstalled(DOUYIN_PACKAGE) ? DOUYIN_PACKAGE : null;
                Intent launch;
                if (pkg != null) {
                    send.setPackage(pkg);
                    launch = send;
                } else {
                    launch = Intent.createChooser(send, "发布到");
                }
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getContext().startActivity(launch);
                        JSObject result = new JSObject();
                        result.put("opened", pkg != null ? pkg : "chooser");
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("打开失败：" + error.getMessage());
                    }
                });
            } catch (Exception error) {
                call.reject("准备视频失败：" + error.getMessage());
            }
        });
    }

    /* ---------------------------------------------------------------- 下载 / 保存 */

    private File download(PluginCall call) throws Exception {
        String url = call.getString("url", "");
        String token = call.getString("token", "");
        String fileId = call.getString("fileId", "").replaceAll("[^a-zA-Z0-9]", "");
        if (url.isEmpty() || fileId.isEmpty()) throw new IllegalArgumentException("missing url");
        File dir = new File(getContext().getCacheDir(), "publish");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache dir");
        File target = new File(dir, fileId + extOf(mimeOf(call)));
        if (target.exists() && target.length() > 0) return target;
        Request request = new Request.Builder().url(url).header("Authorization", "Bearer " + token).build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) throw new IllegalStateException("HTTP " + response.code());
            File partial = new File(dir, fileId + ".part");
            try (InputStream in = response.body().byteStream(); OutputStream out = new FileOutputStream(partial)) {
                copy(in, out);
            }
            if (!partial.renameTo(target)) throw new IllegalStateException("rename");
        }
        return target;
    }

    /** 默认视频；图片作品传 image/png、image/jpeg 等 */
    private static String mimeOf(PluginCall call) {
        String mime = call.getString("mime", "video/mp4");
        return mime == null || mime.isEmpty() ? "video/mp4" : mime;
    }

    private static boolean isImage(String mime) {
        return mime.startsWith("image/");
    }

    private static String extOf(String mime) {
        switch (mime) {
            case "image/png": return ".png";
            case "image/jpeg": return ".jpg";
            case "image/webp": return ".webp";
            case "image/gif": return ".gif";
            case "video/quicktime": return ".mov";
            case "video/webm": return ".webm";
            default: return isImage(mime) ? ".png" : ".mp4";
        }
    }

    private Uri saveWithMediaStore(File video, String name, String mime) throws Exception {
        boolean image = isImage(mime);
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_MOVIES) + "/Vidloom");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("MediaStore insert");
        try (InputStream in = new FileInputStream(video); OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("MediaStore stream");
            copy(in, out);
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return uri;
    }

    /** Android 8–9：写到公共 Movies 目录并通知图库（需要存储权限，清单里已按 maxSdk 28 声明） */
    @SuppressWarnings("deprecation")
    private Uri saveLegacy(File video, String name, String mime) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(isImage(mime) ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_MOVIES), "Vidloom");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("media dir");
        File target = new File(dir, name);
        try (InputStream in = new FileInputStream(video); OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { target.getAbsolutePath() }, new String[] { mime }, null);
        return Uri.fromFile(target);
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
    }

    private String installedTikTok() {
        for (String pkg : TIKTOK_PACKAGES) if (isInstalled(pkg)) return pkg;
        return null;
    }

    private boolean isInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }
}
