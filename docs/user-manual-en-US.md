# VideoGenerate User Guide (English)

**Document version**: Align with the application version in `package.json`. On-screen text always takes precedence.

---

## 1. Overview

**VideoGenerate** is a Windows desktop app for **batch-creating vertical short videos**. Manage multi-segment source clips under **Products**, define structure and effects under **Templates**, then generate many `.mp4` outputs under **Tasks**, with deduplication and a render queue.

---

## 2. System requirements

| Item | Notes |
|------|--------|
| OS | **Windows 10/11, 64-bit (x64)** |
| Network | Activation and silent license checks require access to the license server; Edge-TTS voiceover needs network access where applicable |
| Disk | Allow enough space for the output folder and cache; batch jobs use significant temporary and final storage |

---

## 3. Install and uninstall

### 3.1 Install

1. Obtain the installer (typically `VideoGenerate-x.x.x-Setup.exe`).
2. Run it and follow the wizard; choose an installation folder.
3. Launch **VideoGenerate** from the desktop or Start menu.

### 3.2 Uninstall

- Remove the app via **Windows Settings → Apps**.  
- **Note**: The distributed package may be configured to **delete application data** on uninstall (local settings and business data). Back up important exports beforehand.

---

## 4. First launch and license

### 4.1 Activation screen

On first use, or if the license is invalid/expired, you will see **Activation**:

- **Machine ID**: Generated locally, read-only; use **Copy** to send to your vendor for binding or support.
- **License key**: Enter exactly as received (**case-sensitive**).
- Click **Activate**. On success, the key is stored locally and the main UI opens.

### 4.2 Common license issues

| Message / behavior | Likely cause |
|--------------------|--------------|
| Invalid key | Typo or key not yet active on the server |
| Bound to another device | First activation locked to another PC; contact vendor for reset/policy |
| Expired | Key past `expire_time` |
| Verification / network error | Check firewall and connectivity to the license API |

### 4.3 Every startup

The app **silently re-validates** the saved key and machine ID. If validation fails, you must activate again (renew or replace key with vendor help).

---

## 5. UI and language

- Left sidebar: **Products**, **Templates**, **Tasks**.
- Bottom of the sidebar: **language** selector — **简体中文 / English / Tiếng Việt** (persisted).
- Title bar: window controls (minimize, maximize, close) as provided by your build.

---

## 6. Products (media library)

### 6.1 Products and segments

- Create products (e.g. phone case, earrings) to organize assets.
- Each product has **segments** (e.g. hook, show, detail). Segment names can be customized; add new segments as needed.

### 6.2 Add and browse clips

- **Add videos** per segment. The app reads duration, resolution, frame rate, etc., and builds thumbnails.
- **Drag and drop**: with a product selected, drag **video files or a folder** onto the right-hand segment/media area; when the blue overlay appears, release to **batch-import into the active segment** (same processing as **Add media**; folders are scanned recursively for common video types).
- **Split long video**: pick one long file, set target segment length (default ~3s); the app fast-splits with stream copy and **adds all clips to the current segment** (stored under app data—don’t delete files that are still referenced).
- **Pagination** keeps large libraries responsive; click a tile to **preview** the source video.
- **Multi-select** mode: select all on page, clear, or batch-delete.

### 6.3 Tips

- More **distinct clips per segment** improve variety and help the dedupe engine enqueue closer to your target batch size.

---

## 7. Templates (structure and effects)

Pick the **product** the template follows; segment rows stay in sync with that product. New segments on the product are reflected in the template with defaults.

### 7.1 Structure and duration

- **Add / remove / reorder** segments (drag-and-drop supported).
- Set **total output duration** range (often ~7–15 seconds; follow the UI).
- **Skip start**: ignore the first seconds of each source clip to avoid black/intro frames.

### 7.2 Order and randomness

- Optionally **shuffle** segment order (often keeping the first segments fixed) to reduce duplicate-looking outputs.

### 7.3 On-screen titles (no TTS)

- **On-screen title** pools: use **group cards** in the template UI—each card is a **title line + symbol block** (multi-line allowed). Add multiple cards for A/B pools; each render **picks one random group** (top area).  
- Use **symbol templates** for quick inserts; **Manage library** edits saved presets locally (about 20 built-ins + restore defaults).  
- This path does **not** call speech synthesis.

### 7.4 Voice (Edge-TTS)

- Enable **voiceover** to synthesize audio from the **voice script pool** (line-based random pick), mixed into the final render.  
- **Voice scripts** and **on-screen titles** are separate pools; put top titles in the title area, not only in the voice area.  
- Blocks may be separated with a line of `---` (three or more hyphens); lines still join the random pool after save.

### 7.5 ASS subtitles

- Controls rolling subtitle style alongside TTS when enabled. **On-screen titles** can burn independently of the ASS toggle—follow the actual switches on screen.  
- Margin controls adjust distance from top/bottom for readability.  
- With the **soft white-on-dark** preset, burned titles/subtitles use a rounded **bold italic** look; bundled fonts provide multilanguage glyph fallback (run the project’s font setup before first build as documented).
- After importing fonts, the UI shows availability hints. If a `woff2` warning appears, prefer `ttf/otf/ttc`, and make sure the template uses the real **Family Name** (not the filename).

### 7.6 Original audio and BGM

- **Original audio**: keep or mute clip audio (muting does not remove voiceover/BGM).  
- **BGM**: pick multiple tracks; each video randomly picks one. If a file has no audio track or fails probing, logs may note it and that render may have no BGM.  
- **Ducking**: lowers BGM when speech/original audio is loud. Raise the BGM level if it feels too quiet.

### 7.7 Other parameters (if shown)

- Per-segment **duration range, zoom, pan** add light randomness.  
- **Transitions / color tweaks** may live on another tab—explore the Template UI.

### 7.8 Reference video analysis (one-click template)

- In **Templates**, use **Analyze and Create Template** with `video` (or an absolute path). The app analyzes duration, FPS, resolution, bitrate, and a lightweight cut tendency.
- Analysis only creates a **new template**. It does not overwrite existing templates and does not import those videos into the product media library.
- The generated profile targets a **natural real-shot style** and keeps output at **1080x1920**.

---

## 8. Tasks (batch render)

1. Open **Tasks**.
2. Select **product** and **template**.
3. Set **count** and **output folder** (use a drive with free space).
4. Click **Start** (or equivalent).

### 8.1 Queue and controls

- Jobs run in a queue (concurrency depends on build). Watch progress, status, and logs.  
- **Pause / Resume**: paused state stops new work from starting; behavior of in-flight FFmpeg jobs follows the product version (some builds restart a job from the beginning after pause).

### 8.2 Deduplication

- Hash-based dedupe avoids duplicate combinations.  
- If you request **N** videos but fewer are enqueued, causes include: limited clip combinations, similarity limits, or caps. The UI may show **“enqueued x/N”** and reasons.  
- **Mitigation**: add more unique clips per segment, or relax template/random constraints if available.

### 8.3 Output files

- Outputs are typically **vertical MP4**; encoder choice may vary by machine (fallbacks exist).  
- Use **Reveal in folder** (or similar) on completed tasks to open Explorer at the file.  
- **📱 Scan**: With the phone on the **same Wi‑Fi** as the PC, tap **Scan** on a completed task to show a QR code; open it in the phone browser or camera app to play that render over LAN (allow the preview port through the Windows firewall if prompted).

---

## 9. Updates

- If auto-update is configured, after download you may see **“Update ready”**—restart to install, or postpone.  
- Otherwise, download a new installer from the vendor’s page and install over the old build.

---

## 10. FAQ

**Q: Why copy Machine ID?**  
A: Some vendors need it to bind or verify your device in their admin panel.

**Q: Same license on a new PC?**  
A: Policy-dependent; many keys bind on first activation—ask the vendor for reset or a new key.

**Q: Right after install I see “Queued 0/5”—why?**  
A: Seed products ship **with no video clips**. Templates usually need **at least one clip in every segment** (e.g. hook, show, detail). Open **Products**, select the product you use, add media to each segment, then run **Tasks** again.

**Q: Render failed?**  
A: Read the task log. Check disk space, folder permissions, corrupt media, and unusual paths.

**Q: No voiceover audio?**  
A: Ensure voiceover is enabled, the script pool is non-empty, and network works. Check system volume and whether the output track is silent.

---

## 11. Further reading

- Technical details: **`docs/requirements.md`**, **`docs/client-desktop-api.md`** (for integrators, not required for end users).

---

*Thank you for using VideoGenerate.*

## 12. Windows Testing and Linux Deployment Notes
- Recommended workflow: develop and run regression checks on Windows first.
- Before release, run at least one render on Linux with the same template to confirm parity.
- If ASS subtitles fail to use the expected font on Linux, verify font directory permissions and prefer `ttf/otf/ttc` over `woff2`.
- For same-name stickers, the template `ref` source (`bundled:*` or `user:*`) is the final selection key.

### Audio Note (v0.1.7)
- To avoid short videos falling entirely into silent intros, the renderer now trims leading BGM silence before mixing. If output still feels quiet, increase the BGM volume in template settings.

## 13. Clone Studio (Structure Replication)
- Entry: left navigation `Clone`.
- Flow: upload local viral reference video -> AI blueprint analysis -> fill shot materials (manual upload or AI generation) -> create batch replica tasks -> manual final review.
- Default strategy: Vietnamese script by default (Chinese optional), Runway primary with Pika fallback, output still uses the existing task pipeline.
- Note: this feature replicates structure and style only; it does not copy third-party watermark/logo/account marks.

## 14. Clone Studio 2.0 (Cross-Product with Fixed Script)
- Finish reference analysis and shot material setup first.
- At generation time, pick a target product; each run creates an independent replica session from the same script structure.
- Session supports copy-variation strength (low/medium/high) under quality-first policy.
- Review panel supports filtering by session/status/low-score and allows keep/reject decisions per result.
