# -*- coding: utf-8 -*-
import json
import math
import os
import sys
import time


CURRENT_REQUEST_ID = None
MODEL_ENCODER_CACHE = {}


def emit(payload):
    if CURRENT_REQUEST_ID:
        payload = dict(payload)
        payload["requestId"] = CURRENT_REQUEST_ID
    print(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), flush=True)


def unavailable(reason):
    emit({"ok": False, "unavailable": True, "reason": str(reason)[:1000]})


def clamp(value):
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def sparse_structure_gate_failed(dinov2_score, orb_score, sparse_profile):
    semantic_structure_failed = float(dinov2_score) < float(sparse_profile.get("minimumDinoV2", 0.72))
    local_structure_failed = float(orb_score) < float(sparse_profile.get("minimumOrb", 0.42))
    return semantic_structure_failed and local_structure_failed


def is_ring_like_request(product_type, product_category):
    text = "\n".join([str(product_type or "").strip().lower(), str(product_category or "").strip().lower()])
    return "ring" in text


def ring_structure_gate_failed(dinov2_score, orb_score, fill_ratio):
    semantic_score = float(dinov2_score)
    local_score = float(orb_score)
    sparse = float(fill_ratio) < 0.5
    if semantic_score < 0.62:
        return True
    if sparse and semantic_score < 0.66 and local_score < 0.08:
        return True
    return False


def requested_writeback_box(region, image_shape):
    if not isinstance(region, dict):
        return None
    try:
        image_height, image_width = image_shape[:2]
        x = max(0.0, min(1.0, float(region.get("x"))))
        y = max(0.0, min(1.0, float(region.get("y"))))
        width = max(0.01, min(1.0 - x, float(region.get("width"))))
        height = max(0.01, min(1.0 - y, float(region.get("height"))))
    except (TypeError, ValueError):
        return None
    target = (
        int(math.floor(x * image_width)),
        int(math.floor(y * image_height)),
        max(1, int(math.ceil(width * image_width))),
        max(1, int(math.ceil(height * image_height))),
    )
    center_x = target[0] + target[2] / 2.0
    center_y = target[1] + target[3] / 2.0
    maximum_width = max(1, int(round(image_width * 0.9)))
    maximum_height = max(1, int(round(image_height * 0.9)))
    expanded_width = min(maximum_width, max(1, int(round(target[2] * 1.8))))
    expanded_height = min(maximum_height, max(1, int(round(target[3] * 1.8))))
    left = max(0, min(image_width - expanded_width, int(round(center_x - expanded_width / 2.0))))
    top = max(0, min(image_height - expanded_height, int(round(center_y - expanded_height / 2.0))))
    return left, top, expanded_width, expanded_height


def load_manifest(model_root):
    manifest_path = os.path.join(os.path.dirname(model_root), "model-manifest.json")
    if not os.path.isfile(manifest_path):
        raise RuntimeError("model_manifest_missing")
    with open(manifest_path, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    models = manifest.get("models") or {}
    for name in ("clip", "dinov2"):
        config = models.get(name) or {}
        file_name = str(config.get("file") or "")
        if not file_name or not os.path.isfile(os.path.join(model_root, file_name)):
            raise RuntimeError("model_files_missing:" + (file_name or name))
    return manifest


def read_image(path, cv2, np):
    if not path or not os.path.isfile(path):
        raise RuntimeError("image_missing:" + str(path))
    encoded = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_UNCHANGED)
    if image is None or image.size == 0:
        raise RuntimeError("image_decode_failed:" + str(path))
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    elif image.shape[2] == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    return image


def align_scene_pair(scene, generated, cv2, np):
    height, width = scene.shape[:2]
    resized = generated.shape[:2] != (height, width)
    candidate = generated if not resized else cv2.resize(generated, (width, height), interpolation=cv2.INTER_AREA)
    scene_bgr = cv2.cvtColor(scene, cv2.COLOR_BGRA2BGR)
    candidate_bgr = cv2.cvtColor(candidate, cv2.COLOR_BGRA2BGR)
    alignment_score, homography = orb_similarity(candidate_bgr, scene_bgr, cv2, np, return_homography=True)
    if homography is None or alignment_score < 0.45 or not np.all(np.isfinite(homography)):
        return scene, candidate, resized, "resize_only"
    aligned = cv2.warpPerspective(
        candidate,
        homography,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT,
    )
    return scene, aligned, resized, "feature_homography"


def largest_components(mask, cv2, np, minimum_area_ratio=0.002):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    image_area = float(mask.shape[0] * mask.shape[1])
    components = []
    for index in range(1, count):
        x, y, width, height, area = [int(value) for value in stats[index]]
        if area < image_area * minimum_area_ratio:
            continue
        component_mask = np.where(labels == index, 255, 0).astype(np.uint8)
        components.append((area, (x, y, width, height), component_mask))
    components.sort(key=lambda item: item[0], reverse=True)
    return components


def padded_box(box, image_shape, padding_ratio=0.08):
    x, y, width, height = box
    image_height, image_width = image_shape[:2]
    padding = int(max(width, height) * padding_ratio)
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(image_width, x + width + padding)
    bottom = min(image_height, y + height + padding)
    return left, top, max(1, right - left), max(1, bottom - top)


def crop_box(image, box):
    x, y, width, height = box
    return image[y:y + height, x:x + width]


def locate_replacement_roi(scene, generated, cv2, np):
    scene_bgr = cv2.cvtColor(scene, cv2.COLOR_BGRA2BGR)
    generated_bgr = cv2.cvtColor(generated, cv2.COLOR_BGRA2BGR)
    scene_lab = cv2.cvtColor(scene_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    generated_lab = cv2.cvtColor(generated_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    difference = np.linalg.norm(scene_lab - generated_lab, axis=2)
    difference = cv2.GaussianBlur(difference, (5, 5), 0)
    normalized = np.clip(difference * 3.0, 0, 255).astype(np.uint8)
    threshold, mask = cv2.threshold(normalized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    threshold = max(18.0, float(threshold))
    mask = np.where(normalized >= threshold, 255, 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    components = largest_components(mask, cv2, np, 0.0005)
    if not components:
        full = (0, 0, scene.shape[1], scene.shape[0])
        return full, mask, 0.0, [full]
    anchor = components[0][1]
    anchor_center = (anchor[0] + anchor[2] / 2.0, anchor[1] + anchor[3] / 2.0)
    horizontal_limit = max(anchor[2] * 2.5, scene.shape[1] * 0.08)
    vertical_limit = max(anchor[3] * 2.5, scene.shape[0] * 0.08)
    selected = []
    for component in components[:12]:
        box = component[1]
        center = (box[0] + box[2] / 2.0, box[1] + box[3] / 2.0)
        if abs(center[0] - anchor_center[0]) <= horizontal_limit and abs(center[1] - anchor_center[1]) <= vertical_limit:
            selected.append(component)
    if not selected:
        selected = [components[0]]
    left = min(item[1][0] for item in selected)
    top = min(item[1][1] for item in selected)
    right = max(item[1][0] + item[1][2] for item in selected)
    bottom = max(item[1][1] + item[1][3] for item in selected)
    roi = padded_box((left, top, right - left, bottom - top), scene.shape, 0.12)
    if float(roi[2] * roi[3]) / float(scene.shape[0] * scene.shape[1]) > 0.35:
        roi = padded_box(anchor, scene.shape, 0.2)
    changed_ratio = float(np.count_nonzero(mask)) / float(mask.size)
    image_area = float(scene.shape[0] * scene.shape[1])
    scored_candidates = []
    for area, box, component_mask in components[:30]:
        area_ratio = float(area) / image_area
        if area_ratio > 0.12:
            continue
        x, y, width, height = box
        touches_border = x <= 1 or y <= 1 or x + width >= scene.shape[1] - 1 or y + height >= scene.shape[0] - 1
        pixels = difference[component_mask > 0]
        strength = float(np.percentile(pixels, 90)) if pixels.size else 0.0
        compactness = float(area) / float(max(1, width * height))
        score = strength * compactness / math.sqrt(max(area_ratio, 1e-8))
        if touches_border:
            score *= 0.2
        scored_candidates.append((score, padded_box(box, scene.shape, 0.2)))
    candidate_rois = [entry[1] for entry in sorted(scored_candidates, key=lambda entry: entry[0], reverse=True)[:10]]
    if roi not in candidate_rois:
        candidate_rois.append(roi)
    return roi, mask, changed_ratio, candidate_rois


def estimate_product_mask(image, cv2, np):
    alpha = image[:, :, 3]
    if np.count_nonzero(alpha < 250) > alpha.size * 0.01:
        mask = np.where(alpha > 24, 255, 0).astype(np.uint8)
    else:
        bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        border = np.concatenate((lab[0, :, :], lab[-1, :, :], lab[:, 0, :], lab[:, -1, :]), axis=0)
        background = np.median(border, axis=0)
        distance = np.linalg.norm(lab - background, axis=2)
        threshold = max(14.0, float(np.percentile(distance, 62)))
        mask = np.where(distance > threshold, 255, 0).astype(np.uint8)
        if np.count_nonzero(mask) < mask.size * 0.01:
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 40, 120)
            mask = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


def projection_line_positions(projection, minimum, np):
    indexes = np.where(projection >= minimum)[0]
    groups = []
    for index in indexes:
        if not groups or index > groups[-1][-1] + 1:
            groups.append([int(index)])
        else:
            groups[-1].append(int(index))
    return [int(round(sum(group) / len(group))) for group in groups if group]


def product_board_cells(product, cv2, np):
    bgr = cv2.cvtColor(product, cv2.COLOR_BGRA2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    dark = gray < 245
    vertical = projection_line_positions(np.count_nonzero(dark, axis=0), gray.shape[0] * 0.62, np)
    horizontal = projection_line_positions(np.count_nonzero(dark, axis=1), gray.shape[1] * 0.62, np)
    vertical = [value for value in vertical if gray.shape[1] * 0.08 < value < gray.shape[1] * 0.92]
    horizontal = [value for value in horizontal if gray.shape[0] * 0.08 < value < gray.shape[0] * 0.92]
    if not vertical and not horizontal:
        return []
    x_edges = [0] + vertical + [gray.shape[1]]
    y_edges = [0] + horizontal + [gray.shape[0]]
    cells = []
    for y_index in range(len(y_edges) - 1):
        for x_index in range(len(x_edges) - 1):
            left = x_edges[x_index] + 2
            top = y_edges[y_index] + 2
            right = x_edges[x_index + 1] - 2
            bottom = y_edges[y_index + 1] - 2
            if right - left < gray.shape[1] * 0.18 or bottom - top < gray.shape[0] * 0.12:
                continue
            content_bottom = top + int((bottom - top) * 0.82)
            cells.append(product[top:content_bottom, left:right].copy())
    return cells


def component_candidates(image, cv2, np, limit=12):
    mask = estimate_product_mask(image, cv2, np)
    components = largest_components(mask, cv2, np, 0.003)
    candidates = []
    for _, box, component_mask in components[:limit]:
        box = padded_box(box, image.shape, 0.05)
        crop = crop_box(image, box).copy()
        crop_mask = crop_box(component_mask, box)
        crop[:, :, 3] = crop_mask
        candidates.append(crop)
    return candidates


def whole_product_candidate(image, cv2, np):
    mask = estimate_product_mask(image, cv2, np)
    components = largest_components(mask, cv2, np, 0.0003)
    if not components:
        return None
    anchor_box = components[0][1]
    anchor_center = (anchor_box[0] + anchor_box[2] / 2.0, anchor_box[1] + anchor_box[3] / 2.0)
    combined = np.zeros_like(mask)
    selected_boxes = []
    for _, box, component_mask in components[:30]:
        center = (box[0] + box[2] / 2.0, box[1] + box[3] / 2.0)
        horizontal_limit = max(anchor_box[2] * 4.0, image.shape[1] * 0.32)
        vertical_limit = max(anchor_box[3] * 4.0, image.shape[0] * 0.32)
        if abs(center[0] - anchor_center[0]) > horizontal_limit or abs(center[1] - anchor_center[1]) > vertical_limit:
            continue
        combined = cv2.bitwise_or(combined, component_mask)
        selected_boxes.append(box)
    if not selected_boxes:
        return None
    left = min(box[0] for box in selected_boxes)
    top = min(box[1] for box in selected_boxes)
    right = max(box[0] + box[2] for box in selected_boxes)
    bottom = max(box[1] + box[3] for box in selected_boxes)
    box = padded_box((left, top, right - left, bottom - top), image.shape, 0.05)
    crop = crop_box(image, box).copy()
    crop[:, :, 3] = crop_box(combined, box)
    return crop


def product_candidates(product, cv2, np, force_single=False):
    cells = [] if force_single else product_board_cells(product, cv2, np)
    candidates = []
    for cell in cells:
        candidates.extend(component_candidates(cell, cv2, np, 3))
    if not candidates:
        whole = whole_product_candidate(product, cv2, np)
        candidates = [whole] if whole is not None else component_candidates(product, cv2, np, 12)
    if not candidates:
        candidates.append(product)
    return candidates


def composite_white(image, cv2, np):
    bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR).astype(np.float32)
    alpha = image[:, :, 3:4].astype(np.float32) / 255.0
    return np.clip(bgr * alpha + 255.0 * (1.0 - alpha), 0, 255).astype(np.uint8)


def generated_product_candidate(generated, roi, difference_mask, cv2, np):
    crop = crop_box(generated, roi).copy()
    mask = crop_box(difference_mask, roi).copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    components = largest_components(mask, cv2, np, 0.002)
    if components:
        combined = np.zeros_like(mask)
        anchor_box = components[0][1]
        anchor_center = (anchor_box[0] + anchor_box[2] / 2.0, anchor_box[1] + anchor_box[3] / 2.0)
        for _, box, component_mask in components[:8]:
            center = (box[0] + box[2] / 2.0, box[1] + box[3] / 2.0)
            if abs(center[0] - anchor_center[0]) <= max(anchor_box[2] * 2.0, crop.shape[1] * 0.15) and abs(center[1] - anchor_center[1]) <= max(anchor_box[3] * 2.0, crop.shape[0] * 0.15):
                combined = cv2.bitwise_or(combined, component_mask)
        mask = combined
    crop[:, :, 3] = mask
    components = largest_components(mask, cv2, np, 0.001)
    if components:
        boxes = [item[1] for item in components[:6]]
        left = min(box[0] for box in boxes)
        top = min(box[1] for box in boxes)
        right = max(box[0] + box[2] for box in boxes)
        bottom = max(box[1] + box[3] for box in boxes)
        box = padded_box((left, top, right - left, bottom - top), crop.shape, 0.08)
        crop = crop_box(crop, box).copy()
    return composite_white(crop, cv2, np)


class OnnxImageEncoder:
    def __init__(self, model_root, config, ort, np):
        self.np = np
        providers = ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(os.path.join(model_root, config["file"]), providers=providers)
        self.input_name = str(config.get("inputName") or self.session.get_inputs()[0].name)
        self.output_name = str(config.get("outputName") or self.session.get_outputs()[0].name)
        size = config.get("inputSize") or [224, 224]
        self.width = int(size[0])
        self.height = int(size[1] if len(size) > 1 else size[0])
        self.mean = np.asarray(config.get("mean") or [0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.asarray(config.get("std") or [0.229, 0.224, 0.225], dtype=np.float32)
        self.layout = str(config.get("layout") or "NCHW").upper()

    def encode(self, image, cv2):
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (self.width, self.height), interpolation=cv2.INTER_AREA).astype(self.np.float32) / 255.0
        normalized = (resized - self.mean) / self.std
        if self.layout == "NHWC":
            tensor = normalized[None, :, :, :]
        else:
            tensor = normalized.transpose(2, 0, 1)[None, :, :, :]
        output = self.session.run([self.output_name], {self.input_name: tensor.astype(self.np.float32)})[0]
        vector = self.np.asarray(output, dtype=self.np.float32)
        while vector.ndim > 2:
            vector = vector.mean(axis=1)
        vector = vector.reshape(-1)
        norm = float(self.np.linalg.norm(vector))
        if not math.isfinite(norm) or norm <= 1e-8:
            raise RuntimeError("model_embedding_invalid")
        return vector / norm


def get_model_encoders(model_root, models, ort, np):
    cache_key = tuple(
        [model_root]
        + [
            os.path.getmtime(os.path.join(model_root, str((models.get(name) or {}).get("file") or "")))
            for name in ("clip", "dinov2")
        ]
    )
    cached = MODEL_ENCODER_CACHE.get(cache_key)
    if cached:
        return cached
    encoders = {
        "clip": OnnxImageEncoder(model_root, models["clip"], ort, np),
        "dinov2": OnnxImageEncoder(model_root, models["dinov2"], ort, np),
    }
    MODEL_ENCODER_CACHE.clear()
    MODEL_ENCODER_CACHE[cache_key] = encoders
    return encoders


def cosine_score(first, second, np):
    cosine = float(np.dot(first, second))
    return clamp((cosine + 1.0) / 2.0)


def orb_similarity(reference, candidate, cv2, np, return_homography=False):
    first = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    second = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=1800, scaleFactor=1.2, nlevels=8, fastThreshold=8)
    keypoints_a, descriptors_a = orb.detectAndCompute(first, None)
    keypoints_b, descriptors_b = orb.detectAndCompute(second, None)
    if descriptors_a is None or descriptors_b is None or len(keypoints_a) < 8 or len(keypoints_b) < 8:
        return (0.0, None) if return_homography else 0.0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(descriptors_a, descriptors_b, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance]
    coverage = min(1.0, len(good) / max(18.0, min(len(keypoints_a), len(keypoints_b)) * 0.22))
    homography = None
    inlier_ratio = 0.0
    if len(good) >= 6:
        source = np.float32([keypoints_a[item.queryIdx].pt for item in good]).reshape(-1, 1, 2)
        target = np.float32([keypoints_b[item.trainIdx].pt for item in good]).reshape(-1, 1, 2)
        homography, inliers = cv2.findHomography(source, target, cv2.RANSAC, 5.0)
        if inliers is not None:
            inlier_ratio = float(np.count_nonzero(inliers)) / float(len(good))
    score = clamp(0.45 * coverage + 0.55 * inlier_ratio)
    return (score, homography) if return_homography else score


def ssim_score(first, second, cv2, np):
    first_gray = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY).astype(np.float32)
    second_gray = cv2.cvtColor(second, cv2.COLOR_BGR2GRAY).astype(np.float32)
    second_gray = cv2.resize(second_gray, (first_gray.shape[1], first_gray.shape[0]), interpolation=cv2.INTER_AREA)
    c1 = 6.5025
    c2 = 58.5225
    mu_a = cv2.GaussianBlur(first_gray, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(second_gray, (11, 11), 1.5)
    sigma_a = cv2.GaussianBlur(first_gray * first_gray, (11, 11), 1.5) - mu_a * mu_a
    sigma_b = cv2.GaussianBlur(second_gray * second_gray, (11, 11), 1.5) - mu_b * mu_b
    sigma_ab = cv2.GaussianBlur(first_gray * second_gray, (11, 11), 1.5) - mu_a * mu_b
    numerator = (2.0 * mu_a * mu_b + c1) * (2.0 * sigma_ab + c2)
    denominator = (mu_a * mu_a + mu_b * mu_b + c1) * (sigma_a + sigma_b + c2)
    score_map = numerator / np.maximum(denominator, 1e-8)
    return clamp((float(np.mean(score_map)) + 1.0) / 2.0)


def scene_preservation_score(scene, generated, roi, cv2, np):
    scene_bgr = cv2.cvtColor(scene, cv2.COLOR_BGRA2BGR)
    generated_bgr = cv2.cvtColor(generated, cv2.COLOR_BGRA2BGR)
    absolute = cv2.absdiff(scene_bgr, generated_bgr).astype(np.float32)
    mask = np.ones(scene.shape[:2], dtype=np.uint8)
    x, y, width, height = padded_box(roi, scene.shape, 0.0)
    mask[y:y + height, x:x + width] = 0
    pixels = absolute[mask > 0]
    if pixels.size == 0:
        return 0.0
    color_score = 1.0 - float(np.mean(pixels)) / 255.0
    return clamp(color_score)


def text_shape_consistency(reference, candidate, orb_score, foreground_ratio, cv2, np):
    if foreground_ratio < 0.58:
        return 1.0, False
    gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 3)))
    _, binary = cv2.threshold(blackhat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    image_area = float(gray.shape[0] * gray.shape[1])
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        area = width * height
        aspect = width / max(1.0, float(height))
        if image_area * 0.00004 <= area <= image_area * 0.025 and 0.15 <= aspect <= 6.0:
            boxes.append((x, y, width, height))
    has_text_row = False
    for seed in boxes:
        seed_center = seed[1] + seed[3] / 2.0
        row = [
            box for box in boxes
            if abs((box[1] + box[3] / 2.0) - seed_center) <= max(seed[3], box[3]) * 0.55
            and 0.45 <= box[3] / max(1.0, float(seed[3])) <= 2.2
        ]
        if len(row) < 4:
            continue
        left = min(box[0] for box in row)
        right = max(box[0] + box[2] for box in row)
        if right - left >= gray.shape[1] * 0.24:
            has_text_row = True
            break
    if not has_text_row:
        return 1.0, False
    detail_reference = cv2.Laplacian(gray, cv2.CV_32F)
    candidate_gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
    candidate_gray = cv2.resize(candidate_gray, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_AREA)
    detail_candidate = cv2.Laplacian(candidate_gray, cv2.CV_32F)
    correlation = cv2.matchTemplate(detail_reference, detail_candidate, cv2.TM_CCOEFF_NORMED)[0][0]
    return clamp(0.7 * orb_score + 0.3 * ((float(correlation) + 1.0) / 2.0)), True


def choose_product_view(candidates, generated_roi, encoders, cv2, np):
    generated_embeddings = {name: encoder.encode(generated_roi, cv2) for name, encoder in encoders.items()}
    best = None
    for index, candidate in enumerate(candidates):
        candidate_bgr = composite_white(candidate, cv2, np)
        foreground_ratio = float(np.count_nonzero(candidate[:, :, 3])) / float(candidate[:, :, 3].size)
        deep_scores = {
            name: cosine_score(encoder.encode(candidate_bgr, cv2), generated_embeddings[name], np)
            for name, encoder in encoders.items()
        }
        orb = orb_similarity(candidate_bgr, generated_roi, cv2, np)
        rank = 0.4 * deep_scores["clip"] + 0.4 * deep_scores["dinov2"] + 0.2 * orb
        if best is None or rank > best[0]:
            best = (rank, index, candidate_bgr, deep_scores, orb, foreground_ratio)
    if best is None:
        raise RuntimeError("product_view_selection_failed")
    return best


def choose_replacement_roi(candidate_rois, generated, difference_mask, product_candidates_list, encoders, cv2, np):
    prepared_products = []
    for candidate in product_candidates_list:
        candidate_bgr = composite_white(candidate, cv2, np)
        prepared_products.append({
            name: encoder.encode(candidate_bgr, cv2)
            for name, encoder in encoders.items()
        })
    best = None
    for roi in candidate_rois:
        generated_roi = generated_product_candidate(generated, roi, difference_mask, cv2, np)
        generated_embeddings = {name: encoder.encode(generated_roi, cv2) for name, encoder in encoders.items()}
        semantic_score = max(
            0.5 * cosine_score(product_embeddings["clip"], generated_embeddings["clip"], np)
            + 0.5 * cosine_score(product_embeddings["dinov2"], generated_embeddings["dinov2"], np)
            for product_embeddings in prepared_products
        )
        area_ratio = float(roi[2] * roi[3]) / float(generated.shape[0] * generated.shape[1])
        rank = semantic_score - max(0.0, area_ratio - 0.08) * 0.5
        if best is None or rank > best[0]:
            best = (rank, roi, generated_roi, semantic_score)
    if best is None:
        fallback_roi = candidate_rois[0]
        return fallback_roi, generated_product_candidate(generated, fallback_roi, difference_mask, cv2, np), 0.0
    return best[1], best[2], best[3]


def process_line(line):
    global CURRENT_REQUEST_ID
    if not line:
        unavailable("request_missing")
        return
    request = json.loads(line)
    CURRENT_REQUEST_ID = str(request.get("requestId") or "") or None
    model_root = str(request.get("modelRoot") or "")
    manifest = load_manifest(model_root)
    try:
        import cv2
        import numpy as np
        import onnxruntime as ort
    except Exception as error:
        unavailable("python_dependencies_missing:" + str(error))
        return

    started_at = time.time()
    scene = read_image(str(request.get("scenePath") or ""), cv2, np)
    product = read_image(str(request.get("productPath") or ""), cv2, np)
    generated = read_image(str(request.get("generatedPath") or ""), cv2, np)
    requested_region = request.get("replacementRegion")
    if isinstance(requested_region, dict):
        resized = generated.shape[:2] != scene.shape[:2]
        if resized:
            generated = cv2.resize(generated, (scene.shape[1], scene.shape[0]), interpolation=cv2.INTER_AREA)
        alignment_mode = "explicit_region"
    else:
        scene, generated, resized, alignment_mode = align_scene_pair(scene, generated, cv2, np)
    roi, difference_mask, changed_ratio, roi_candidates = locate_replacement_roi(scene, generated, cv2, np)
    product_path = str(request.get("productPath") or "")
    product_type = str(request.get("productType") or "")
    product_category = str(request.get("productCategory") or "")
    force_single_product = os.path.basename(product_path).lower().startswith("single-product-")
    candidates = product_candidates(product, cv2, np, force_single=force_single_product)
    models = manifest.get("models") or {}
    encoders = get_model_encoders(model_root, models, ort, np)
    roi, generated_roi, roi_semantic_score = choose_replacement_roi(
        roi_candidates,
        generated,
        difference_mask,
        candidates,
        encoders,
        cv2,
        np,
    )
    _, selected_index, selected, deep_scores, orb, foreground_ratio = choose_product_view(candidates, generated_roi, encoders, cv2, np)
    ssim = ssim_score(selected, generated_roi, cv2, np)
    requested_box = requested_writeback_box(requested_region, scene.shape)
    scene_score = scene_preservation_score(scene, generated, requested_box or roi, cv2, np)
    text_score, text_evaluated = text_shape_consistency(selected, generated_roi, orb, foreground_ratio, cv2, np)
    weights = manifest.get("weights") or {"clip": 0.4, "dinov2": 0.3, "orb": 0.2, "ssim": 0.1}
    score = clamp(
        float(weights.get("clip", 0.4)) * deep_scores["clip"]
        + float(weights.get("dinov2", 0.3)) * deep_scores["dinov2"]
        + float(weights.get("orb", 0.2)) * orb
        + float(weights.get("ssim", 0.1)) * ssim
    )
    thresholds = manifest.get("hardThresholds") or {}
    profiles = manifest.get("profiles") or {}
    sparse_profile = profiles.get("sparseWearable") or {}
    sparse_limit = float(sparse_profile.get("maximumForegroundRatio", 0.58))
    quality_profile = "sparse_wearable" if foreground_ratio < sparse_limit else "standard_product"
    recommended_pass_threshold = float(sparse_profile.get("passThreshold", 0.72)) if quality_profile == "sparse_wearable" else None
    recommended_retry_floor = float(sparse_profile.get("retryFloor", 0.55)) if quality_profile == "sparse_wearable" else None
    hard_failures = []
    if requested_box is not None and resized:
        hard_failures.append("output_canvas_mismatch")
    scene_threshold = 0.995 if requested_box is not None else float(thresholds.get("scenePreservation", 0.94))
    if scene_score < scene_threshold:
        hard_failures.append("outside_scene_drift" if requested_box is not None else "scene_preservation")
    if changed_ratio <= 0.0005:
        hard_failures.append("replacement_region_missing")
    if changed_ratio >= float(thresholds.get("maximumChangedArea", 0.45)):
        hard_failures.append("replacement_region_too_large")
    if text_evaluated and text_score < float(thresholds.get("textConsistency", 0.55)):
        hard_failures.append("product_text_consistency")
    if quality_profile == "sparse_wearable":
        if is_ring_like_request(product_type, product_category):
            if ring_structure_gate_failed(deep_scores["dinov2"], orb, foreground_ratio):
                hard_failures.append("ring_structure_consistency")
        elif sparse_structure_gate_failed(deep_scores["dinov2"], orb, sparse_profile):
            hard_failures.append("product_structure_consistency")
    notes = [
        "selected_product_view:" + str(selected_index),
        "product_view_count:" + str(len(candidates)),
        "selected_foreground_ratio:" + format(foreground_ratio, ".6f"),
        "quality_profile:" + quality_profile,
        "changed_area_ratio:" + format(changed_ratio, ".6f"),
        "replacement_roi:" + ",".join(str(int(value)) for value in roi),
        "replacement_roi_semantic_score:" + format(roi_semantic_score, ".6f"),
        "text_check:" + ("evaluated" if text_evaluated else "not_applicable"),
        "scene_alignment:" + alignment_mode,
        "replacement_region:" + ("explicit" if requested_box is not None else "detected"),
    ]
    if "product_structure_consistency" in hard_failures:
        notes.append("sparse_wearable_structure_gate:failed")
    if "ring_structure_consistency" in hard_failures:
        notes.append("ring_structure_gate:failed")
    if resized:
        notes.append("generated_image_resized_for_scene_comparison")
    emit({
        "ok": True,
        "score": score,
        "qualityProfile": quality_profile,
        "recommendedPassThreshold": recommended_pass_threshold,
        "recommendedRetryFloor": recommended_retry_floor,
        "components": {
            "clip": deep_scores["clip"],
            "dinov2": deep_scores["dinov2"],
            "orb": orb,
            "ssim": ssim,
            "scenePreservation": scene_score,
            "textConsistency": text_score,
        },
        "hardFailures": hard_failures,
        "notes": notes,
        "durationMs": int((time.time() - started_at) * 1000),
    })


def main():
    if "--serve" in sys.argv:
        for line in sys.stdin:
            try:
                process_line(line)
            except Exception as error:
                unavailable("quality_service_failed:" + str(error))
        return
    process_line(sys.stdin.readline())


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        unavailable("quality_service_failed:" + str(error))
