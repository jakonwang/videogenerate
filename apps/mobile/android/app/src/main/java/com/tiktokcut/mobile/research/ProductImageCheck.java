package com.tiktokcut.mobile.research;

/** Pixel checks for product images cropped from a screenshot. Plain Java so it can be tested off-device. */
final class ProductImageCheck {
    private ProductImageCheck() {
    }

    /**
     * True for an unloaded placeholder or a black video surface: almost every sampled pixel has one color.
     * The top 30% (sticky bar, play badge) and a margin on the other sides (card padding) are ignored.
     */
    static boolean isBlank(int[] pixels, int width, int height) {
        int left = width / 12;
        int right = width - left;
        int top = height * 3 / 10;
        int bottom = height - height / 12;
        if (right - left < 24 || bottom - top < 24) return false;
        int steps = 24;
        int[] colors = new int[steps * steps];
        int count = 0;
        for (int row = 0; row < steps; row += 1) {
            int y = top + (bottom - top - 1) * row / (steps - 1);
            for (int column = 0; column < steps; column += 1) {
                colors[count++] = pixels[y * width + left + (right - left - 1) * column / (steps - 1)];
            }
        }
        int best = 0;
        for (int index = 0; index < count; index += 8) {
            int matches = 0;
            for (int other = 0; other < count; other += 1) if (close(colors[index], colors[other], 8)) matches += 1;
            best = Math.max(best, matches);
        }
        return best >= count * 0.97;
    }

    /** Amount of fine detail; rises while a low-resolution preview is being replaced by the real image. */
    static double sharpness(int[] pixels, int width, int height) {
        double sum = 0;
        long count = 0;
        for (int y = 2; y < height - 2; y += 3) {
            for (int x = 2; x < width - 2; x += 3) {
                int center = y * width + x;
                sum += Math.abs(4 * luma(pixels[center]) - luma(pixels[center - 1]) - luma(pixels[center + 1])
                    - luma(pixels[center - width]) - luma(pixels[center + width]));
                count += 1;
            }
        }
        return count == 0 ? 0 : sum / count;
    }

    /** Content bounds {left, top, right, bottom} without the thin card padding (at most 5%) around the image. */
    static int[] trim(int[] pixels, int width, int height) {
        int maxX = width / 20;
        int maxY = height / 20;
        int bottom = height;
        while (height - bottom < maxY && isPaddingRow(pixels, width, bottom - 1)) bottom -= 1;
        int top = 0;
        while (top < maxY && isPaddingRow(pixels, width, top)) top += 1;
        int right = width;
        while (width - right < maxX && isPaddingColumn(pixels, width, right - 1, top, bottom)) right -= 1;
        int left = 0;
        while (left < maxX && isPaddingColumn(pixels, width, left, top, bottom)) left += 1;
        return new int[] { left, top, right, bottom };
    }

    /**
     * Below the previous card's last text line come its padding, a gap in another color, then the image.
     * Returns the first image row, or -1 when that pattern is not there.
     */
    static int findImageTop(int[] pixels, int width, int height, int fromY, int maxScan) {
        int padding = 0;
        int gap = 0;
        int gapRows = 0;
        boolean hasPadding = false;
        boolean hasGap = false;
        int end = Math.min(height, fromY + maxScan);
        for (int y = Math.max(0, fromY); y < end; y += 1) {
            boolean uniform = isUniformRow(pixels, width, y);
            int color = pixels[y * width + width / 2];
            if (hasGap) {
                if (uniform && close(color, gap, 3)) {
                    gapRows += 1;
                    continue;
                }
                if (gapRows >= 5) return y;
                // The first gap row is often a blend of both colors: start counting again from this row.
                if (uniform && !close(color, padding, 3)) {
                    gap = color;
                    gapRows = 1;
                    continue;
                }
                hasGap = false;
                hasPadding = false;
            }
            if (!uniform) {
                hasPadding = false;
            } else if (!hasPadding || close(color, padding, 3)) {
                hasPadding = true;
                padding = color;
            } else {
                hasGap = true;
                gap = color;
                gapRows = 1;
            }
        }
        return -1;
    }

    /** Scans upwards for the thin gap above the image and returns the first row below it, or -1. */
    static int findTopAbove(int[] pixels, int width, int height, int gapColor) {
        int run = 0;
        for (int y = height - 1; y >= -1; y -= 1) {
            if (y >= 0 && isUniformRow(pixels, width, y) && close(pixels[y * width + width / 2], gapColor, 3)) {
                run += 1;
                continue;
            }
            // A thicker band is a plain photo background that happens to have the gap's color.
            if (run >= width / 100 && run <= width / 20) return y + 1 + run;
            run = 0;
        }
        return -1;
    }

    /** First row after the plain strip at the top, or -1 when the strip is too thick to be just spacing. */
    static int skipUniformRows(int[] pixels, int width, int height) {
        int y = 0;
        while (y < height && isUniformRow(pixels, width, y)) y += 1;
        return y <= width / 10 ? y : -1;
    }

    static int mostCommon(int[] colors) {
        int best = 0;
        int result = 0;
        for (int index = 0; index < colors.length; index += 7) {
            int matches = 0;
            for (int other = 0; other < colors.length; other += 3) if (close(colors[index], colors[other], 2)) matches += 1;
            if (matches > best) {
                best = matches;
                result = colors[index];
            }
        }
        return result;
    }

    private static boolean isUniformRow(int[] pixels, int width, int y) {
        int reference = pixels[y * width + width / 2];
        // Rounded card corners differ from the gap color at the very edges.
        for (int x = width / 16; x < width - width / 16; x += 4) {
            if (!close(pixels[y * width + x], reference, 4)) return false;
        }
        return true;
    }

    private static boolean isPaddingRow(int[] pixels, int width, int y) {
        for (int x = 0; x < width; x += 3) if (!nearWhite(pixels[y * width + x])) return false;
        return true;
    }

    private static boolean isPaddingColumn(int[] pixels, int width, int x, int top, int bottom) {
        int other = 0;
        int count = 0;
        for (int y = top; y < bottom; y += 3) {
            count += 1;
            if (!nearWhite(pixels[y * width + x])) other += 1;
        }
        return other <= count * 0.02;
    }

    private static boolean nearWhite(int color) {
        return ((color >> 16) & 255) >= 236 && ((color >> 8) & 255) >= 236 && (color & 255) >= 236;
    }

    private static int luma(int color) {
        return (((color >> 16) & 255) * 299 + ((color >> 8) & 255) * 587 + (color & 255) * 114) / 1000;
    }

    private static boolean close(int first, int second, int tolerance) {
        return Math.abs(((first >> 16) & 255) - ((second >> 16) & 255)) <= tolerance
            && Math.abs(((first >> 8) & 255) - ((second >> 8) & 255)) <= tolerance
            && Math.abs((first & 255) - (second & 255)) <= tolerance;
    }
}
