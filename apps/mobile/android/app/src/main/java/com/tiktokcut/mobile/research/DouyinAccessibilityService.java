package com.tiktokcut.mobile.research;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.util.Log;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import android.view.accessibility.AccessibilityNodeInfo;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public final class DouyinAccessibilityService extends AccessibilityService {
    private static final String DOUYIN_PACKAGE = "com.ss.android.ugc.aweme";
    private static final String TAG = "ProductResearch";
    private static final int MAX_IMAGE_WAIT_ATTEMPTS = 8;
    /** Enough screenshots to tell a still-sharpening preview from a video that simply keeps moving. */
    private static final int MAX_SETTLE_ATTEMPTS = 3;
    private static final int MAX_DEFERRALS = 3;
    private static final long IMAGE_WAIT_MS = 1100; // Android 11 allows one screenshot per second
    private static final float MIN_VISIBLE_IMAGE_RATIO = 0.7f;
    /** Height, relative to screen width, of the floating back-to-top buttons at the bottom right. */
    private static final float FLOATING_BUTTONS_RATIO = 0.28f;
    /** Text of the card above; finding it inside an image area means the area starts too high. */
    private static final Pattern CARD_TEXT_PATTERN = Pattern.compile("已售\\s*\\d|回头客\\s*\\d|[月周]上新|店铺销量|旗舰店.?$|进店.?$");
    private static final Pattern ZERO_WIDTH = Pattern.compile("[\\u200B-\\u200D\\uFEFF]");
    private static final Pattern SALES_PATTERN = Pattern.compile(
        "(?:\\u5df2\\u552e|\\u9500\\u91cf)?\\s*(\\d+(?:\\.\\d+)?)(\\u4e07)?\\+?(?:\\u4ef6|\\u4eba\\u4ed8\\u6b3e|\\u5df2\\u552e)"
    );
    private static final Pattern PRICE_PATTERN = Pattern.compile("(?:[\\u00a5\\uffe5])?\\s*(\\d+(?:\\.\\d{1,2})?)");
    private static final Pattern OCR_PRICE_PATTERN = Pattern.compile("[\\u00a5\\uffe5]\\s*(\\d+(?:\\.\\d{1,2})?)");
    private static final Pattern OCR_PRICE_NUMBER_PATTERN = Pattern.compile("(?<!\\d)(\\d+(?:\\.\\d{1,2})?)(?!\\d)");
    private static final Pattern SALES_NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");
    private static DouyinAccessibilityService instance;
    private static JSONObject pendingTask;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> emittedTitles = new HashSet<>();
    private final Map<String, PendingProduct> pending = new LinkedHashMap<>();
    private final Map<String, Double> lastSharpness = new HashMap<>();
    private final TextRecognizer textRecognizer = TextRecognition.getClient(
        new ChineseTextRecognizerOptions.Builder().build()
    );
    private JSONObject task;
    private String taskId = "";
    private String keyword = "";
    private int targetCount;
    private int emittedCount;
    private int scrollCount;
    private int unchangedPageCount;
    private boolean cancelled;

    public static synchronized boolean submitTask(JSONObject task) {
        DouyinAccessibilityService current = instance;
        if (current == null) {
            pendingTask = task;
            return true;
        }
        current.handler.post(() -> current.startTask(task));
        return true;
    }

    public static void cancelTask(String taskId) {
        DouyinAccessibilityService current = instance;
        if (current != null && current.taskId.equals(taskId)) current.cancelled = true;
    }

    public static boolean isEnabled(Context context) {
        AccessibilityManager manager = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null || !manager.isEnabled()) return false;
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (info.getResolveInfo() == null || info.getResolveInfo().serviceInfo == null) continue;
            String packageName = info.getResolveInfo().serviceInfo.packageName;
            String className = info.getResolveInfo().serviceInfo.name;
            if (context.getPackageName().equals(packageName) && DouyinAccessibilityService.class.getName().equals(className)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void onServiceConnected() {
        instance = this;
        JSONObject queued;
        synchronized (DouyinAccessibilityService.class) {
            queued = pendingTask;
            pendingTask = null;
        }
        if (queued != null) handler.post(() -> startTask(queued));
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
    }

    @Override
    public void onInterrupt() {
        fail("Accessibility service was interrupted.");
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void startTask(JSONObject value) {
        // 断线重连后电脑会重发手上的任务：同一个任务还在跑就继续跑，不报错
        if (task != null && taskId.equals(value.optString("id"))) return;
        if (task != null) {
            ConnectionService.sendTaskEvent("task_failed", value.optString("id"), "Another task is already running.", null);
            return;
        }
        task = value;
        taskId = value.optString("id");
        keyword = value.optString("keyword");
        targetCount = Math.max(1, Math.min(1000, value.optInt("targetCount", 100)));
        emittedCount = 0;
        scrollCount = 0;
        unchangedPageCount = 0;
        cancelled = false;
        emittedTitles.clear();
        pending.clear();
        lastSharpness.clear();
        ConnectionService.sendTaskEvent("task_started", taskId, null, null);
        Log.i(TAG, "Task " + taskId + " started, keyword=" + keyword);

        // Douyin resumes wherever it was last left, so the home-page search entry is unreliable.
        // Open the search result page directly; fall back to the launcher flow if the link is unsupported.
        Intent searchLink = new Intent(Intent.ACTION_VIEW, Uri.parse("snssdk1128://search/result?keyword=" + Uri.encode(keyword)));
        searchLink.setPackage(DOUYIN_PACKAGE);
        searchLink.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            startActivity(searchLink);
            handler.postDelayed(() -> selectProductsTab(0), 3000);
            return;
        } catch (Exception error) {
            Log.w(TAG, "Search deep link failed, falling back to launcher", error);
        }

        Intent launch = getPackageManager().getLaunchIntentForPackage(DOUYIN_PACKAGE);
        if (launch == null) {
            fail("Douyin is not installed.");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(launch);
        handler.postDelayed(() -> openSearch(0), 2500);
    }

    private void openSearch(int retry) {
        if (stopIfCancelled()) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo search = findNode(root, "\u641c\u7d22", true, false);
        if (search != null && clickNode(search)) {
            handler.postDelayed(() -> enterKeyword(0), 1200);
        } else if (retry < 5) {
            handler.postDelayed(() -> openSearch(retry + 1), 700);
        } else {
            fail("Search entry was not found.");
        }
    }

    private void enterKeyword(int retry) {
        if (stopIfCancelled()) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo input = findEditable(root);
        if (input == null) {
            if (retry < 5) handler.postDelayed(() -> enterKeyword(retry + 1), 600);
            else fail("Search input was not found.");
            return;
        }
        Bundle arguments = new Bundle();
        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, keyword);
        input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            && input.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId())) {
            handler.postDelayed(() -> selectProductsTab(0), 1800);
        } else {
            handler.postDelayed(() -> clickSearchSubmit(0), 500);
        }
    }

    private void clickSearchSubmit(int retry) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo submit = findNode(root, "\u641c\u7d22", false, true);
        if (submit != null && clickNode(submit)) {
            handler.postDelayed(() -> selectProductsTab(0), 1800);
        } else if (retry < 4) {
            handler.postDelayed(() -> clickSearchSubmit(retry + 1), 500);
        } else {
            fail("Search submit button was not found.");
        }
    }

    private void selectProductsTab(int retry) {
        if (stopIfCancelled()) return;
        AccessibilityNodeInfo productTab = findExactNode(getRootInActiveWindow(), "\u5546\u54c1");
        if (productTab != null && clickNode(productTab)) {
            handler.postDelayed(() -> selectSalesSort(0), 1300);
        } else if (retry < 6) {
            handler.postDelayed(() -> selectProductsTab(retry + 1), 700);
        } else {
            fail("Product tab was not found.");
        }
    }

    private void selectSalesSort(int retry) {
        if (stopIfCancelled()) return;
        if (!"sales".equals(task.optString("sort"))) {
            handler.postDelayed(this::collectPage, 800);
            return;
        }
        AccessibilityNodeInfo sales = findExactNode(getRootInActiveWindow(), "\u9500\u91cf");
        if (sales != null && clickNode(sales)) {
            handler.postDelayed(this::collectPage, 1300);
        } else if (retry < 6) {
            handler.postDelayed(() -> selectSalesSort(retry + 1), 700);
        } else {
            fail("Sales sort was not found.");
        }
    }

    private void collectPage() {
        lastSharpness.clear();
        collectPage(0);
    }

    /** Captures the visible page, retrying while any product image is still an unloaded placeholder. */
    private void collectPage(int attempt) {
        if (stopIfCancelled()) return;
        List<TextEntry> entries = new ArrayList<>();
        collectText(getRootInActiveWindow(), entries);
        List<ProductCandidate> candidates = extractCandidates(entries);
        Log.i(TAG, "Page " + scrollCount + " attempt " + attempt + ": " + entries.size() + " text nodes, " + candidates.size() + " new products" + ", " + pending.size() + " pending");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            emitProducts(candidates, null, null);
            finishCollectionPass();
            return;
        }
        takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
            @Override
            public void onSuccess(ScreenshotResult screenshot) {
                Bitmap hardwareBitmap = Bitmap.wrapHardwareBuffer(
                    screenshot.getHardwareBuffer(),
                    screenshot.getColorSpace()
                );
                if (hardwareBitmap == null) {
                    screenshot.getHardwareBuffer().close();
                    emitProducts(candidates, null, null);
                    finishCollectionPass();
                    return;
                }
                Bitmap bitmap = hardwareBitmap.copy(Bitmap.Config.ARGB_8888, false);
                screenshot.getHardwareBuffer().close();
                for (ProductCandidate candidate : candidates) locateImageTop(candidate, bitmap);
                int waiting = 0;
                for (ProductCandidate candidate : candidates) {
                    if (fitsScreen(candidate, bitmap) && !imageSettled(candidate, bitmap, attempt)) waiting += 1;
                }
                if (waiting > 0 && attempt < MAX_IMAGE_WAIT_ATTEMPTS) {
                    Log.i(TAG, waiting + " product image(s) still loading, waiting");
                    bitmap.recycle();
                    handler.postDelayed(() -> collectPage(attempt + 1), IMAGE_WAIT_MS);
                    return;
                }
                textRecognizer.process(InputImage.fromBitmap(bitmap, 0))
                    .addOnSuccessListener(text -> {
                        emitProducts(candidates, bitmap, text);
                        bitmap.recycle();
                        finishCollectionPass();
                    })
                    .addOnFailureListener(error -> {
                        emitProducts(candidates, bitmap, null);
                        bitmap.recycle();
                        finishCollectionPass();
                    });
            }

            @Override
            public void onFailure(int errorCode) {
                // Usually the screenshot rate limit; giving up at once would lose every image on the page.
                if (attempt < MAX_IMAGE_WAIT_ATTEMPTS) {
                    handler.postDelayed(() -> collectPage(attempt + 1), IMAGE_WAIT_MS);
                    return;
                }
                emitProducts(candidates, null, null);
                finishCollectionPass();
            }
        });
    }

    private List<ProductCandidate> extractCandidates(List<TextEntry> entries) {
        List<ProductCandidate> candidates = new ArrayList<>();
        int viewportTop = listViewportTop(entries);
        for (int index = 0; index < entries.size(); index += 1) {
            TextEntry salesEntry = entries.get(index);
            String salesText = salesEntry.value;
            Matcher salesMatcher = SALES_PATTERN.matcher(salesText);
            if (!isSalesText(salesText) || !salesMatcher.find()) continue;
            TextEntry titleEntry = findTitle(entries, index, salesEntry.bounds);
            if (titleEntry == null) continue;
            String title = titleEntry.value.trim();
            if (emittedTitles.contains(title)) continue;
            double salesValue = Double.parseDouble(salesMatcher.group(1));
            if (salesMatcher.group(2) != null) salesValue *= 10000;
            String priceText = findPrice(entries, index, salesEntry.bounds);
            Rect imageBounds = productImageBounds(titleEntry.bounds, viewportTop);
            candidates.add(new ProductCandidate(
                title, salesText, Math.round(salesValue), priceText, salesEntry.bounds, imageBounds, viewportTop
            ));
        }
        return candidates;
    }

    /**
     * The product image is directly above the card's title; a square until locateImageTop measures it. Other
     * texts are no guide: nodes of hidden tabs can lie over the image.
     */
    private Rect productImageBounds(Rect titleBounds, int viewportTop) {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int columnWidth = screenWidth / 2;
        boolean leftColumn = titleBounds.centerX() < columnWidth;
        int left = leftColumn ? 12 : columnWidth + 12;
        int right = leftColumn ? columnWidth - 12 : screenWidth - 12;
        int textTop = titleBounds.top;
        int bottom = Math.max(1, textTop - 8);
        int top = Math.max(0, bottom - (right - left));
        // Cards scrolled partly under the sticky search/tab/filter bar: keep only the visible part of
        // the image, and drop it entirely when too little is left to be recognisable.
        if (top < viewportTop) {
            top = viewportTop;
            if (bottom - top < (right - left) * MIN_VISIBLE_IMAGE_RATIO) return new Rect();
        }
        return new Rect(left, top, right, bottom);
    }

    /**
     * Top edge of the visible product list: everything above it (search box, tabs, sort and filter
     * chips) is a sticky header drawn over the scrolling cards.
     */
    private int listViewportTop(List<TextEntry> entries) {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int top = 0;
        Rect list = new Rect();
        findLargestScrollable(getRootInActiveWindow(), screenWidth, list);
        if (!list.isEmpty()) top = list.top;
        // Tabs / sort labels can sit inside the list container as a pinned header; include them too.
        for (TextEntry entry : entries) {
            if (entry.bounds.bottom < screenHeight / 2 && (isNavigationText(entry.value) || isFilterText(entry.value))) {
                top = Math.max(top, entry.bounds.bottom);
            }
        }
        // Horizontally scrolling filter chip rows sit directly under the tabs.
        List<Rect> rows = new ArrayList<>();
        collectHorizontalScrollers(getRootInActiveWindow(), screenWidth, screenHeight, rows);
        for (Rect row : rows) top = Math.max(top, row.bottom);
        return top;
    }

    private void findLargestScrollable(AccessibilityNodeInfo node, int screenWidth, Rect best) {
        if (node == null) return;
        if (node.isScrollable()) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (bounds.width() >= screenWidth * 0.8f && bounds.height() > best.height()) best.set(bounds);
        }
        for (int index = 0; index < node.getChildCount(); index += 1) findLargestScrollable(node.getChild(index), screenWidth, best);
    }

    private void collectHorizontalScrollers(AccessibilityNodeInfo node, int screenWidth, int screenHeight, List<Rect> rows) {
        if (node == null) return;
        if (node.isScrollable()) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (bounds.width() >= screenWidth * 0.6f && bounds.height() < screenHeight / 8 && bounds.bottom < screenHeight / 2) {
                rows.add(bounds);
            }
        }
        for (int index = 0; index < node.getChildCount(); index += 1) {
            collectHorizontalScrollers(node.getChild(index), screenWidth, screenHeight, rows);
        }
    }

    private boolean isFilterText(String value) {
        // Header-only labels (the 'month sales over 10k' / 'well reviewed' chips and the filter button).
        return value.equals("月销过万") || value.equals("好评多") || value.equals("筛选");
    }

    /** Images are square or 3:4 portrait; the gap between cards tells where this one starts. */
    private void locateImageTop(ProductCandidate candidate, Bitmap screenshot) {
        Rect image = candidate.imageBounds;
        if (image.isEmpty()) return;
        int bottom = Math.min(image.bottom, screenshot.getHeight());
        int from = Math.max(candidate.viewportTop, image.bottom - image.width() * 3 / 2);
        int to = Math.min(bottom, image.bottom - image.width() * 9 / 10);
        if (to - from < 12) return;
        // The gutter between the two columns has the same color as the gap between cards.
        Rect gutter = onScreen(new Rect(screenshot.getWidth() / 2, from, screenshot.getWidth() / 2 + 1, bottom), screenshot);
        int top = ProductImageCheck.findTopAbove(
            pixels(screenshot, new Rect(image.left, from, image.right, to)), image.width(), to - from,
            ProductImageCheck.mostCommon(pixels(screenshot, gutter))
        );
        if (top < 0 && scrollCount == 0 && from == candidate.viewportTop) {
            // First row of an unscrolled list: no card above, the image follows the filter bar.
            top = ProductImageCheck.skipUniformRows(pixels(screenshot, new Rect(image.left, from, image.right, to)), image.width(), to - from);
        }
        if (top < 0) return;
        image.top = from + top;
        candidate.topKnown = true;
    }

    /** The floating buttons at the bottom right are drawn over this area. */
    private static boolean underButtons(Rect area, Bitmap screenshot) {
        return area.centerX() >= screenshot.getWidth() / 2
            && area.bottom > screenshot.getHeight() - screenshot.getWidth() * FLOATING_BUTTONS_RATIO;
    }

    /** True when the whole image and the sold line below it are on screen and nothing floats over them. */
    private static boolean fitsScreen(ProductCandidate candidate, Bitmap screenshot) {
        Rect image = candidate.imageBounds;
        if (image.isEmpty() || image.height() < image.width() * 0.98f) return false;
        if (candidate.salesBounds.isEmpty()
            || candidate.salesBounds.bottom > screenshot.getHeight() - screenshot.getWidth() / 40) return false;
        return !underButtons(image, screenshot);
    }

    /** Loaded, and no longer getting sharper since the previous screenshot of this page. */
    private boolean imageSettled(ProductCandidate candidate, Bitmap screenshot, int attempt) {
        Rect area = onScreen(candidate.imageBounds, screenshot);
        if (area.isEmpty()) return true;
        int[] pixels = pixels(screenshot, area);
        if (ProductImageCheck.isBlank(pixels, area.width(), area.height())) {
            lastSharpness.remove(candidate.title);
            return false;
        }
        double sharpness = ProductImageCheck.sharpness(pixels, area.width(), area.height());
        Double previous = lastSharpness.put(candidate.title, sharpness);
        if (previous == null) return false;
        return attempt >= MAX_SETTLE_ATTEMPTS || sharpness <= previous * 1.08;
    }

    private static Rect onScreen(Rect bounds, Bitmap screenshot) {
        Rect area = new Rect(bounds);
        return area.intersect(0, 0, screenshot.getWidth(), screenshot.getHeight()) ? area : new Rect();
    }

    private static int[] pixels(Bitmap bitmap, Rect area) {
        int[] result = new int[area.width() * area.height()];
        bitmap.getPixels(result, 0, area.width(), area.left, area.top, area.width(), area.height());
        return result;
    }

    /** Moves an area that starts inside the card above down to where the image really begins. */
    private static Rect alignImage(ProductCandidate candidate, Bitmap screenshot, Text recognizedText) {
        Rect area = onScreen(candidate.imageBounds, screenshot);
        if (area.isEmpty() || recognizedText == null) return area;
        int textBottom = -1;
        for (Text.TextBlock block : recognizedText.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect bounds = line.getBoundingBox();
                if (bounds == null || !area.contains(bounds.centerX(), bounds.centerY())) continue;
                if (bounds.centerY() > area.top + area.height() * 0.6f) continue;
                if (CARD_TEXT_PATTERN.matcher(line.getText().replace(" ", "")).find()) textBottom = Math.max(textBottom, bounds.bottom);
            }
        }
        if (textBottom < 0) return area;
        int top = ProductImageCheck.findImageTop(
            pixels(screenshot, area), area.width(), area.height(), textBottom - area.top, area.width() / 4
        );
        // No card gap below the text: it is printed on the product photo itself.
        if (top < 0) return area;
        top += area.top;
        int bottom = top + candidate.imageBounds.width();
        if (bottom > candidate.salesBounds.top || bottom > screenshot.getHeight()) return new Rect();
        return new Rect(area.left, top, area.right, bottom);
    }

    /**
     * Emits products whose image is complete. The others wait for a later page, where the same card sits
     * higher on screen (and its video, if any, may have stopped on the cover); once gone they go out as they are.
     */
    private void emitProducts(List<ProductCandidate> candidates, Bitmap screenshot, Text recognizedText) {
        int emittedBefore = emittedCount;
        Set<String> visible = new HashSet<>();
        for (ProductCandidate candidate : candidates) visible.add(candidate.title);
        flushPending(visible);
        for (ProductCandidate candidate : candidates) {
            if (emittedCount >= targetCount) return;
            if (emittedTitles.contains(candidate.title)) continue;
            String priceText = candidate.priceText;
            if (priceText.isEmpty() && recognizedText != null && screenshot != null) {
                priceText = findOcrPrice(recognizedText, candidate.salesBounds, screenshot.getWidth());
            }
            PendingProduct product = pending.get(candidate.title);
            if (product == null) product = new PendingProduct(candidate);
            if (!priceText.isEmpty()) product.priceText = priceText;
            if (recognizedText == null || showsSales(recognizedText, candidate)) product.seen = true;
            boolean complete = Build.VERSION.SDK_INT < Build.VERSION_CODES.R;
            if (screenshot != null) {
                Rect area = alignImage(candidate, screenshot, recognizedText);
                // A part hidden by the floating buttons, cut off or blank is worse than no image.
                boolean usable = !area.isEmpty()
                    && !underButtons(area, screenshot)
                    && area.height() >= candidate.imageBounds.width() * MIN_VISIBLE_IMAGE_RATIO
                    && !ProductImageCheck.isBlank(pixels(screenshot, area), area.width(), area.height());
                complete = usable && product.seen && candidate.topKnown && fitsScreen(candidate, screenshot);
                if (usable && (complete || area.height() >= product.imageHeight)) {
                    product.imageDataUrl = cropProductImage(screenshot, area);
                    product.imageHeight = area.height();
                }
            }
            product.deferrals += 1;
            if (complete || product.deferrals > MAX_DEFERRALS) {
                pending.remove(candidate.title);
                emitProduct(product);
            } else {
                pending.put(candidate.title, product);
            }
        }
        unchangedPageCount = emittedCount == emittedBefore ? unchangedPageCount + 1 : 0;
    }

    /** The node tree also holds cards of other, hidden tabs: the sold count must really be drawn at its place. */
    private static boolean showsSales(Text recognizedText, ProductCandidate candidate) {
        Matcher expected = SALES_NUMBER.matcher(candidate.salesText);
        if (!expected.find()) return true;
        Rect sales = candidate.salesBounds;
        for (Text.TextBlock block : recognizedText.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect bounds = line.getBoundingBox();
                if (bounds == null || Math.abs(bounds.centerY() - sales.centerY()) > 40) continue;
                if (bounds.right < sales.left || bounds.left > sales.right) continue;
                Matcher shown = SALES_NUMBER.matcher(line.getText().replace(" ", ""));
                while (shown.find()) if (shown.group().equals(expected.group())) return true;
            }
        }
        return false;
    }

    /** Emits waiting products that are no longer on screen. */
    private void flushPending(Set<String> visible) {
        Iterator<Map.Entry<String, PendingProduct>> iterator = pending.entrySet().iterator();
        while (iterator.hasNext() && emittedCount < targetCount) {
            Map.Entry<String, PendingProduct> entry = iterator.next();
            if (visible.contains(entry.getKey())) continue;
            iterator.remove();
            emitProduct(entry.getValue());
        }
    }

    private void emitProduct(PendingProduct product) {
        if (!product.seen) {
            Log.i(TAG, "Dropped, never visible on screen: " + product.candidate.title);
            return;
        }
        if (!emittedTitles.add(product.candidate.title)) return;
        String priceText = product.priceText;
        try {
            JSONObject result = new JSONObject();
            result.put("title", product.candidate.title);
            result.put("priceText", priceText);
            if (!priceText.isEmpty()) {
                Matcher priceMatcher = OCR_PRICE_PATTERN.matcher(priceText);
                if (priceMatcher.find()) result.put("priceValue", Double.parseDouble(priceMatcher.group(1)));
            }
            result.put("salesText", product.candidate.salesText);
            result.put("salesValue", product.candidate.salesValue);
            result.put("rank", emittedCount + 1);
            result.put("capturedAt", System.currentTimeMillis());
            result.put("confidence", priceText.isEmpty() ? 0.68 : 0.88);
            if (!product.imageDataUrl.isEmpty()) result.put("imageDataUrl", product.imageDataUrl);
            ConnectionService.sendTaskEvent("result", taskId, null, result);
            emittedCount += 1;
        } catch (Exception ignored) {
        }
    }

    private TextEntry findTitle(List<TextEntry> entries, int salesIndex, Rect salesBounds) {
        for (int index = salesIndex - 1; index >= Math.max(0, salesIndex - 12); index -= 1) {
            TextEntry entry = entries.get(index);
            String value = entry.value.trim();
            if (sameColumn(entry.bounds, salesBounds)
                && entry.bounds.bottom <= salesBounds.top
                && value.length() >= 5
                && value.length() <= 120
                && !isSalesText(value)
                && !PRICE_PATTERN.matcher(value).matches()
                && !isNavigationText(value)) {
                return entry;
            }
        }
        return null;
    }

    private String findPrice(List<TextEntry> entries, int salesIndex, Rect salesBounds) {
        for (int index = salesIndex - 1; index >= Math.max(0, salesIndex - 8); index -= 1) {
            TextEntry entry = entries.get(index);
            String value = entry.value.trim();
            Matcher matcher = PRICE_PATTERN.matcher(value);
            if (sameColumn(entry.bounds, salesBounds) && matcher.matches()) return value;
        }
        return "";
    }

    private String findOcrPrice(Text recognizedText, Rect salesBounds, int screenWidth) {
        boolean leftColumn = salesBounds.centerX() < screenWidth / 2;
        int columnLeft = leftColumn ? 0 : screenWidth / 2;
        int columnRight = leftColumn ? screenWidth / 2 : screenWidth;
        String numberFallback = "";
        for (Text.TextBlock block : recognizedText.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect bounds = line.getBoundingBox();
                if (bounds == null || bounds.centerX() < columnLeft || bounds.centerX() > columnRight) continue;
                if (Math.abs(bounds.centerY() - salesBounds.centerY()) > 90) continue;
                String value = line.getText().replace(" ", "");
                Matcher matcher = OCR_PRICE_PATTERN.matcher(value);
                if (matcher.find()) return "\u00a5" + matcher.group(1);
                if (numberFallback.isEmpty()
                    && bounds.right <= salesBounds.left + 24
                    && !value.contains("\u4e07")
                    && !value.contains("\u5df2\u552e")) {
                    Matcher numberMatcher = OCR_PRICE_NUMBER_PATTERN.matcher(value);
                    if (numberMatcher.find()) numberFallback = "\u00a5" + numberMatcher.group(1);
                }
            }
        }
        return numberFallback;
    }

    private String cropProductImage(Bitmap screenshot, Rect area) {
        int[] content = ProductImageCheck.trim(pixels(screenshot, area), area.width(), area.height());
        Bitmap crop = Bitmap.createBitmap(
            screenshot, area.left + content[0], area.top + content[1], content[2] - content[0], content[3] - content[1]
        );
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        crop.compress(Bitmap.CompressFormat.JPEG, 90, output);
        crop.recycle();
        return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
    }

    private boolean sameColumn(Rect first, Rect second) {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        return (first.centerX() < screenWidth / 2) == (second.centerX() < screenWidth / 2);
    }

    private void finishCollectionPass() {
        if (task == null || stopIfCancelled()) return;
        if (emittedCount >= targetCount) {
            complete();
            return;
        }
        if (scrollCount >= 400 || unchangedPageCount >= 12) {
            flushPending(new HashSet<>());
            if (emittedCount >= targetCount) {
                complete();
                return;
            }
            fail("The product list ended before the requested quantity was collected.");
            return;
        }
        scrollCount += 1;
        scrollDown();
    }

    /** Sold-count line; "月上新20件" and "满3件送赠品" also contain a count but are shop / promotion labels. */
    private static boolean isSalesText(String value) {
        return value.length() <= 24 && (value.contains("已售") || value.contains("销量") || value.contains("人付款"))
            && SALES_PATTERN.matcher(value).find();
    }

    private boolean isNavigationText(String value) {
        return value.equals("\u7efc\u5408") || value.equals("\u5546\u54c1") || value.equals("\u9500\u91cf")
            || value.equals("\u7528\u6237") || value.equals("\u89c6\u9891") || value.equals("\u641c\u7d22");
    }

    private void scrollDown() {
        Path path = new Path();
        float width = getResources().getDisplayMetrics().widthPixels;
        float height = getResources().getDisplayMetrics().heightPixels;
        // Shorter than a screen minus one card, so that a card cut off at the bottom of this page is complete
        // on the next one. The sideways tail leaves no vertical speed on release; otherwise the list flings on.
        path.moveTo(width * 0.4f, height * 0.74f);
        path.lineTo(width * 0.4f, height * 0.42f);
        path.lineTo(width * 0.65f, height * 0.42f);
        GestureDescription gesture = new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, 1300))
            .build();
        dispatchGesture(gesture, new GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                handler.postDelayed(DouyinAccessibilityService.this::collectPage, 900);
            }

            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                handler.postDelayed(DouyinAccessibilityService.this::collectPage, 1200);
            }
        }, handler);
    }

    private AccessibilityNodeInfo findNode(AccessibilityNodeInfo node, String value, boolean contentDescriptionFirst, boolean clickableOnly) {
        if (node == null) return null;
        CharSequence primary = contentDescriptionFirst ? node.getContentDescription() : node.getText();
        CharSequence secondary = contentDescriptionFirst ? node.getText() : node.getContentDescription();
        boolean matches = contains(primary, value) || contains(secondary, value);
        if (matches && (!clickableOnly || canClick(node))) return node;
        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo found = findNode(node.getChild(index), value, contentDescriptionFirst, clickableOnly);
            if (found != null) return found;
        }
        return null;
    }

    /** First node (tree order, i.e. top of screen first) whose text or description is exactly {@code value}. */
    private AccessibilityNodeInfo findExactNode(AccessibilityNodeInfo node, String value) {
        if (node == null) return null;
        if (value.equals(clean(node.getText())) || value.equals(clean(node.getContentDescription()))) return node;
        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo found = findExactNode(node.getChild(index), value);
            if (found != null) return found;
        }
        return null;
    }

    private static String clean(CharSequence value) {
        return value == null ? "" : ZERO_WIDTH.matcher(value).replaceAll("").trim();
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable()) return node;
        for (int index = 0; index < node.getChildCount(); index += 1) {
            AccessibilityNodeInfo found = findEditable(node.getChild(index));
            if (found != null) return found;
        }
        return null;
    }

    private boolean clickNode(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        while (current != null) {
            if (current.isClickable() && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            current = current.getParent();
        }
        // No clickable ancestor accepted the action: tap the node's center instead.
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        if (bounds.isEmpty()) return false;
        Path path = new Path();
        path.moveTo(bounds.exactCenterX(), bounds.exactCenterY());
        return dispatchGesture(new GestureDescription.Builder()
            .addStroke(new GestureDescription.StrokeDescription(path, 0, 60))
            .build(), null, null);
    }

    private boolean canClick(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo current = node;
        while (current != null) {
            if (current.isClickable()) return true;
            current = current.getParent();
        }
        return false;
    }

    private void collectText(AccessibilityNodeInfo node, List<TextEntry> values) {
        if (node == null) return;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        // Douyin inserts zero-width spaces between title characters; strip them before matching.
        String text = clean(node.getText());
        if (!text.isEmpty()) values.add(new TextEntry(text, new Rect(bounds)));
        String description = clean(node.getContentDescription());
        if (!description.isEmpty() && !description.equals(text)) {
            values.add(new TextEntry(description, new Rect(bounds)));
        }
        for (int index = 0; index < node.getChildCount(); index += 1) collectText(node.getChild(index), values);
    }

    private boolean contains(CharSequence value, String expected) {
        return value != null && value.toString().contains(expected);
    }

    private boolean stopIfCancelled() {
        if (!cancelled) return false;
        // Desktop tasks are cancelled by the desktop itself; the phone app needs to hear about its own.
        if (ResearchEvents.isLocal(taskId)) ConnectionService.sendTaskEvent("task_failed", taskId, "cancelled", null);
        clearTask();
        return true;
    }

    private void complete() {
        boolean local = ResearchEvents.isLocal(taskId);
        ConnectionService.sendTaskEvent("task_completed", taskId, null, null);
        clearTask();
        if (local) ResearchEvents.returnToApp(this);
    }

    private void fail(String error) {
        if (taskId.isEmpty()) return;
        Log.w(TAG, "Task " + taskId + " failed: " + error);
        boolean local = ResearchEvents.isLocal(taskId);
        ConnectionService.sendTaskEvent("task_failed", taskId, error, null);
        clearTask();
        if (local) ResearchEvents.returnToApp(this);
    }

    private void clearTask() {
        handler.removeCallbacksAndMessages(null);
        task = null;
        taskId = "";
        keyword = "";
        cancelled = false;
    }

    private static final class TextEntry {
        private final String value;
        private final Rect bounds;

        private TextEntry(String value, Rect bounds) {
            this.value = value;
            this.bounds = bounds;
        }
    }

    private static final class PendingProduct {
        private final ProductCandidate candidate;
        private String priceText = "";
        private String imageDataUrl = "";
        private int imageHeight;
        private int deferrals;
        private boolean seen;

        private PendingProduct(ProductCandidate candidate) {
            this.candidate = candidate;
        }
    }

    private static final class ProductCandidate {
        private final String title;
        private final String salesText;
        private final long salesValue;
        private final String priceText;
        private final Rect salesBounds;
        private final Rect imageBounds;
        private final int viewportTop;
        private boolean topKnown;

        private ProductCandidate(String title, String salesText, long salesValue, String priceText, Rect salesBounds, Rect imageBounds, int viewportTop) {
            this.viewportTop = viewportTop;
            this.imageBounds = new Rect(imageBounds);
            this.title = title;
            this.salesText = salesText;
            this.salesValue = salesValue;
            this.priceText = priceText;
            this.salesBounds = new Rect(salesBounds);
        }
    }
}
