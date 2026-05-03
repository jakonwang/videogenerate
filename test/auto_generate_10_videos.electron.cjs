const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const electron = require('electron');

const { app, ipcMain } = electron;

const handlers = new Map();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => {
  handlers.set(channel, listener);
  return originalHandle(channel, listener);
};

// 必须尽早加载主进程 bundle（其中会在 app ready 前注册协议）
require(path.resolve(__dirname, '../out/main/index.js'));

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHandlers(channels, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = channels.every((x) => handlers.has(x));
    if (ok) return;
    await sleep(200);
  }
  const missing = channels.filter((x) => !handlers.has(x));
  throw new Error(`IPC handlers not ready: ${missing.join(', ')}`);
}

async function callIpc(channel, payload) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`IPC handler missing: ${channel}`);
  return await fn({}, payload);
}

function buildSegmentsByFileCount(fileCount) {
  if (fileCount >= 30) return ['hook', 'show', 'detail'];
  if (fileCount >= 20) return ['hook', 'show'];
  return ['hook'];
}

function statusIsFinal(s) {
  return s === 'done' || s === 'error' || s === 'cancelled' || s === 'skipped';
}

function isAudioFileName(name) {
  return /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(String(name || ''));
}

async function listFilesRecursive(rootDir, fileNameFilter) {
  const out = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile() && fileNameFilter(ent.name)) {
        out.push(abs);
      }
    }
  }

  await walk(rootDir);
  return out;
}

function buildHotTitlePool() {
  return [
    '新款手机壳上新\n✨防摔耐磨 质感拉满✨',
    '一眼心动的手机壳\n💖通勤百搭 高级显白💖',
    '手感真的太舒服了\n🔥上手秒懂什么叫质感🔥',
    '这个配色太会了\n🌟简约高级 越看越耐看🌟',
    '日常通勤必备款\n👜轻薄不累手 颜值在线👜',
    '防摔保护做得很稳\n🛡四角加固 更安心🛡',
    '拍照出片神器\n📸镜头位不挡光 细节到位📸',
    '预算友好但不廉价\n💰性价比直接拉满💰',
    '送礼自用都合适\n🎁质感包装 氛围感满分🎁',
    '爆款同风格推荐\n🚀喜欢就先下单不犹豫🚀',
  ];
}

function normalizePathForCompare(input) {
  return String(input || '').replace(/[\\/]+/g, '\\').toLowerCase();
}

function isSubPathOf(targetPath, parentPath) {
  const t = normalizePathForCompare(path.resolve(targetPath));
  const p = normalizePathForCompare(path.resolve(parentPath));
  return t === p || t.startsWith(`${p}\\`);
}

function shouldIgnoreSourceVideoPath(fp) {
  const normalized = normalizePathForCompare(fp);
  if (!normalized) return true;
  // 忽略历史自动化产物，避免“拿成片再当素材”导致风格漂移
  return (
    normalized.includes('\\自动化测试输出_') ||
    normalized.includes('\\automation-output_') ||
    /\\自动化测试产品-/.test(normalized)
  );
}

function pickBestAssFontFamily(fontListResult) {
  const list = Array.isArray(fontListResult?.renderableFamilies) ? fontListResult.renderableFamilies : [];
  const names = list.map((x) => String(x?.familyName || '').trim()).filter(Boolean);
  const nameSet = new Set(names.map((x) => x.toLowerCase()));

  const preferred = [
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'Noto Sans',
    'Open Sans',
    'Microsoft YaHei',
    'SimHei',
    'Arial',
  ];

  for (const n of preferred) {
    if (nameSet.has(n.toLowerCase())) return n;
  }
  if (names.length) return names[0];
  return 'Noto Sans SC';
}

async function main() {
  const sourceDir = process.argv[2] || 'E:\\跨境电商\\！手机壳\\测试文件夹\\1';
  const referenceDir = process.argv[3] || 'D:\\phpstudy_pro\\WWW\\videogenerate\\video';
  const targetCount = Number(process.argv[4] || 10);

  const stamp = nowStamp();
  const defaultOutputBase = path.dirname(sourceDir);
  const outputDir = process.argv[5] || path.join(defaultOutputBase, `自动化测试输出_含配乐文字_${stamp}`);
  const musicDir = process.argv[6] || 'E:\\跨境电商\\！手机壳\\测试文件夹\\music';
  const fixedBgmArg = String(process.argv[7] || '').trim();

  const enableBgm = true;
  const enableText = true;
  const lockBgmMode = true;
  const forceMultiScene = true;
  const forceSegKeys = ['hook', 'show', 'detail'];
  const useSingleBgmForBatch = true;
  const fixedBgmVolume = 0.9;

  console.log(`[AUTO] sourceDir=${sourceDir}`);
  console.log(`[AUTO] referenceDir=${referenceDir}`);
  console.log(`[AUTO] targetCount=${targetCount}`);
  console.log(`[AUTO] outputDir=${outputDir}`);
  console.log(`[AUTO] musicDir=${musicDir}`);
  if (fixedBgmArg) console.log(`[AUTO] fixedBgmArg=${fixedBgmArg}`);

  await app.whenReady();
  await waitForHandlers([
    'fs:collectVideoFilesFromDrop',
    'media:getInfo',
    'products:upsert',
    'templates:upsert',
    'fonts:list',
    'tasks:enqueueBatch',
    'tasks:list',
    'style:analyzeVideos',
  ]);

  for (const p of [sourceDir, referenceDir, musicDir]) {
    try {
      const st = await fs.stat(p);
      if (!st.isDirectory()) throw new Error(`${p} is not a directory`);
    } catch (e) {
      throw new Error(`目录不可用: ${p} (${e?.message || e})`);
    }
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputDirResolved = path.resolve(outputDir);

  const filesRaw = await callIpc('fs:collectVideoFilesFromDrop', [sourceDir]);
  const rawCount = Array.isArray(filesRaw) ? filesRaw.length : 0;
  const files = (Array.isArray(filesRaw) ? filesRaw : [])
    .map((x) => String(x))
    .filter(Boolean)
    .filter((fp) => !isSubPathOf(fp, outputDirResolved))
    .filter((fp) => !shouldIgnoreSourceVideoPath(fp))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (!files.length) throw new Error('测试目录未找到可用视频文件');
  console.log(`[AUTO] source videos found=${files.length} (raw=${rawCount})`);

  const musicFiles = (await listFilesRecursive(musicDir, isAudioFileName)).sort((a, b) => a.localeCompare(b, 'en'));
  if (enableBgm && !musicFiles.length) {
    throw new Error(`配乐目录没有可用音频文件: ${musicDir}`);
  }
  console.log(`[AUTO] bgm files found=${musicFiles.length}`);

  let fixedBgmPath = null;
  if (enableBgm) {
    if (fixedBgmArg) {
      try {
        const st = await fs.stat(fixedBgmArg);
        if (!st.isFile()) throw new Error('not a file');
      } catch (e) {
        throw new Error(`指定固定配乐不可用: ${fixedBgmArg} (${e?.message || e})`);
      }
      fixedBgmPath = fixedBgmArg;
    } else {
      fixedBgmPath = musicFiles[0] || null;
    }
  }
  const selectedBgmList = enableBgm
    ? (useSingleBgmForBatch && fixedBgmPath ? [fixedBgmPath] : musicFiles)
    : [];
  if (selectedBgmList.length) {
    console.log(
      `[AUTO] bgm mode=${useSingleBgmForBatch ? 'single-fixed' : 'multi-random'}, selected=${selectedBgmList
        .map((x) => path.basename(x))
        .join('|')}`,
    );
  }

  const segKeysAuto = buildSegmentsByFileCount(files.length);
  const segKeys = forceMultiScene && files.length >= forceSegKeys.length ? forceSegKeys : segKeysAuto;
  console.log(`[AUTO] using segments=${segKeys.join(',')}`);

  const assetsBySeg = Object.fromEntries(segKeys.map((k) => [k, []]));
  const ts = Date.now();

  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    const seg = segKeys[i % segKeys.length];
    try {
      const info = await callIpc('media:getInfo', fp);
      assetsBySeg[seg].push({
        id: randomUUID(),
        filePath: fp,
        fileName: String(info?.fileName || path.basename(fp)),
        fileSize: Number(info?.fileSize || 0),
        durationSec: Number(info?.durationSec || 0),
        width: typeof info?.width === 'number' ? info.width : undefined,
        height: typeof info?.height === 'number' ? info.height : undefined,
        fps: typeof info?.fps === 'number' ? info.fps : undefined,
        bitRate: typeof info?.bitRate === 'number' ? info.bitRate : undefined,
        qualityScore: typeof info?.qualityScore === 'number' ? info.qualityScore : undefined,
        qualityIssues: Array.isArray(info?.qualityIssues) ? info.qualityIssues : undefined,
        thumbnailPath: info?.thumbnailPath ?? null,
        thumbnailDataUrl: info?.thumbnailDataUrl ?? null,
        createdAt: ts,
      });
    } catch (e) {
      console.warn(`[AUTO][WARN] media:getInfo failed: ${fp} -> ${e?.message || e}`);
    }
  }

  for (const k of segKeys) {
    if (!assetsBySeg[k] || !assetsBySeg[k].length) {
      throw new Error(`段位 ${k} 无可用素材，无法继续`);
    }
  }

  const analyzed = await callIpc('style:analyzeVideos', { dir: referenceDir });
  const suggested = analyzed?.suggestedTemplatePayload || {};
  console.log(`[AUTO] reference summary: files=${analyzed?.summary?.fileCount ?? 0}, median=${analyzed?.summary?.durationMedianSec ?? 0}s, fps=${analyzed?.summary?.fpsAvg ?? 0}`);

  const fontsInfo = await callIpc('fonts:list');
  const selectedAssFont = pickBestAssFontFamily(fontsInfo);
  console.log(`[AUTO] selected ASS font family=${selectedAssFont}`);

  const product = await callIpc('products:upsert', {
    name: `自动化测试产品-含配乐文字-${stamp}`,
    type: 'phone_case',
    assets: assetsBySeg,
  });

  const hotTitlePool = buildHotTitlePool();

  const templatePayload = {
    ...suggested,
    name: `自动化测试模板-含配乐文字-${stamp}`,
    structure: segKeys,
    randomizeOrder: suggested?.randomizeOrder ?? { mode: 'none' },
    transition: suggested?.transition ?? { enabled: false, pool: ['hardcut'], durationSec: { min: 0.08, max: 0.14 } },
    aspectUnifyMode: 'cover_crop',
    tts: {
      enabled: false,
      textPool: [],
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 'default',
      pitch: 'default',
      ttsVolume: 'default',
      mixVolume: 0.9,
      keepOriginal: true,
    },
    titleOverlay: enableText
      ? {
          enabled: true,
          textPool: hotTitlePool,
        }
      : null,
    assSubtitle: {
      enabled: enableText,
      fontName: selectedAssFont,
      fontSize: 72,
      preset: 'white_shadow',
      marginV: 320,
      ttsMarginV: 260,
    },
    // 固定 BGM 模式：禁用素材原声与 ducking，保证单曲全程稳定不被压低
    audio: lockBgmMode
      ? {
          source: 'mute',
          ducking: {
            enabled: false,
            amountDb: 0,
          },
        }
      : {
          source: 'keep',
          ducking: {
            enabled: false,
            amountDb: 0,
          },
        },
    bgm: enableBgm
      ? {
          filePaths: selectedBgmList,
          volume: fixedBgmVolume,
        }
      : null,
    lut3d: null,
    sticker: null,
  };

  const template = await callIpc('templates:upsert', templatePayload);

  const baselineList = await callIpc('tasks:list');
  const knownTaskIds = new Set((Array.isArray(baselineList) ? baselineList : []).map((x) => x.id));
  const myTaskIds = new Set();

  let remainToEnqueue = targetCount;
  let enqueueRounds = 0;

  while (remainToEnqueue > 0 && enqueueRounds < 6) {
    enqueueRounds += 1;
    const meta = await callIpc('tasks:enqueueBatch', {
      productId: product.id,
      templateId: template.id,
      count: remainToEnqueue,
      outDir: outputDir,
    });

    const listNow = await callIpc('tasks:list');
    for (const t of listNow) {
      if (!knownTaskIds.has(t.id) && t.productId === product.id && t.templateId === template.id) {
        myTaskIds.add(t.id);
      }
      knownTaskIds.add(t.id);
    }

    const enq = Number(meta?.enqueued || 0);
    console.log(`[AUTO] enqueue round=${enqueueRounds}, requested=${remainToEnqueue}, enqueued=${enq}`);
    if (enq <= 0) break;
    remainToEnqueue -= enq;
  }

  if (!myTaskIds.size) {
    throw new Error('未成功入队任何任务，请检查素材或模板配置');
  }

  console.log(`[AUTO] total enqueued tasks=${myTaskIds.size}`);

  const waitStart = Date.now();
  const timeoutMs = 2 * 60 * 60 * 1000;
  let finalTasks = [];

  while (Date.now() - waitStart < timeoutMs) {
    const listNow = await callIpc('tasks:list');
    finalTasks = listNow.filter((x) => myTaskIds.has(x.id));
    const pending = finalTasks.filter((x) => !statusIsFinal(x.status));
    const done = finalTasks.filter((x) => x.status === 'done').length;
    const err = finalTasks.filter((x) => x.status === 'error').length;
    const cancelled = finalTasks.filter((x) => x.status === 'cancelled').length;
    console.log(`[AUTO] progress: done=${done}/${finalTasks.length}, error=${err}, cancelled=${cancelled}, running=${pending.length}`);
    if (!pending.length) break;
    await sleep(5000);
  }

  finalTasks = (await callIpc('tasks:list')).filter((x) => myTaskIds.has(x.id));

  const doneTasks = finalTasks.filter((x) => x.status === 'done');
  const errorTasks = finalTasks.filter((x) => x.status === 'error');

  const report = {
    sourceDir,
    referenceDir,
    musicDir,
    outputDir,
    targetCount,
    createdAt: new Date().toISOString(),
    productId: product.id,
    templateId: template.id,
    settings: {
      bgmEnabled: enableBgm,
      bgmCount: musicFiles.length,
      bgmSelectedCount: selectedBgmList.length,
      bgmMode: useSingleBgmForBatch ? 'single-fixed' : 'multi-random',
      bgmSelectedFiles: selectedBgmList.map((x) => path.basename(x)),
      bgmVolume: fixedBgmVolume,
      titleEnabled: enableText,
      titlePoolCount: hotTitlePool.length,
      sceneCount: segKeys.length,
      sceneKeys: segKeys,
      assFontFamily: selectedAssFont,
      assPreset: 'white_shadow',
      lockBgmMode,
    },
    summary: {
      totalTasks: finalTasks.length,
      done: doneTasks.length,
      error: errorTasks.length,
      cancelled: finalTasks.filter((x) => x.status === 'cancelled').length,
      skipped: finalTasks.filter((x) => x.status === 'skipped').length,
    },
    outputs: doneTasks.map((x) => x.outPath),
    errors: errorTasks.map((x) => ({ id: x.id, outPath: x.outPath, error: x.error || '' })),
  };

  const stamp2 = nowStamp();
  const reportPath = path.join(outputDir, `automation-report-with-bgm-text-${stamp2}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[AUTO] report saved: ${reportPath}`);
  console.log(`[AUTO] done videos: ${doneTasks.length}`);
  for (const p of doneTasks.map((x) => x.outPath)) console.log(`[AUTO][OUT] ${p}`);

  if (doneTasks.length < targetCount) {
    process.exitCode = 2;
  }

  app.quit();
}

main().catch((e) => {
  console.error('[AUTO][FATAL]', e?.stack || e?.message || e);
  process.exitCode = 1;
  try {
    app.quit();
  } catch {
    // ignore
  }
});
