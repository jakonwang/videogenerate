const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'test', 'artifacts', 'live-photo-desktop');
const TEST_IMAGE =
  process.env.LIVE_PHOTO_TEST_IMAGE ||
  path.join(ROOT, 'test', 'artifacts', 'product-library-desktop', '03-image-uploaded.png');
const TEST_PHONE = process.env.PRODUCT_LIBRARY_TEST_PHONE || '13800138000';
const TEST_CODE = process.env.PRODUCT_LIBRARY_TEST_CODE || '123456';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function waitFor(condition, timeoutMs, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function screenshot(page, name) {
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function openLivePhoto(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    location.hash = '#/plugins/live-photo-generator';
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.hash.includes('/plugins/live-photo-generator') || location.hash.includes('/home'), { timeout: 30000 });
  await page.waitForSelector('[data-testid="live-photo-page"]', { timeout: 30000 });
}

async function ensureMockCredentials(page) {
  await page.evaluate(async () => {
    const current = await window.api.clone.getModelCredentials();
    await window.api.clone.setModelCredentials({
      ...current,
      allowMockWhenNoKey: true,
      imageProviderPrimary: 'openai',
      openaiApiKey: '',
      seedanceApiKey: '',
      grsaiApiKey: '',
      klingApiKey: '',
      ai666Hub: {
        ...(current.ai666Hub || {}),
        enabled: false,
        apiKey: '',
      },
      vectorEngineHub: {
        ...(current.vectorEngineHub || {}),
        enabled: false,
        apiKey: '',
      },
      xibapiHub: {
        ...(current.xibapiHub || {}),
        enabled: false,
        apiKey: '',
      },
      apifoxHub: {
        ...(current.apifoxHub || {}),
        enabled: false,
        apiKey: '',
      },
    });
  });
}

async function ensureProduct(page, imagePath) {
  return await page.evaluate(async (inputPath) => {
    const list = await window.api.products.list();
    const existing = list.find((item) => String(item.name || '').trim() === 'Live Photo Smoke Product');
    if (existing) return existing.id;
    const created = await window.api.products.upsert({
      name: 'Live Photo Smoke Product',
      type: 'general',
      images: [
        {
          id: `img-${Date.now()}`,
          productId: 'pending',
          filePath: inputPath,
          fileName: 'live-photo-source.png',
          fileSize: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isCover: true,
        },
      ],
      coverImagePath: inputPath,
      analysisBoardPath: inputPath,
      analysisBoardStatus: 'done',
      canonicalSourcePath: inputPath,
      canonicalSourceStatus: 'done',
    });
    return created.id;
  }, imagePath);
}

async function clearLivePhotoItems(page) {
  await page.evaluate(async () => {
    const items = await window.api.livePhoto.list();
    for (const item of items) {
      await window.api.livePhoto.remove(item.id);
    }
  });
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  if (!fs.existsSync(TEST_IMAGE)) throw new Error(`Test image missing: ${TEST_IMAGE}`);

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-photo-export-'));
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'videogen-live-photo-desktop-'));
  const isolatedUserDataDir = path.join(isolatedRoot, 'userData');
  const isolatedDataDir = path.join(isolatedUserDataDir, '.videogenerate');
  ensureDir(isolatedUserDataDir);
  ensureDir(isolatedDataDir);
  const report = {
    startedAt: new Date().toISOString(),
    testImage: TEST_IMAGE,
    exportDir,
    isolatedUserDataDir,
    isolatedDataDir,
    createdProductId: '',
    steps: [],
  };

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VG_APP_ENV: 'development',
      VG_ALLOW_MOCK_GENERATION: 'true',
      VIDEOGENERATE_USER_DATA_DIR: isolatedUserDataDir,
      VIDEOGENERATE_DATA_DIR: isolatedDataDir,
    },
  });
  const page = await app.firstWindow();

  try {
    await openLivePhoto(page);
    await ensureMockCredentials(page);
    await clearLivePhotoItems(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="live-photo-page"]', { timeout: 30000 });
    report.steps.push({ step: 'open-live-photo', screenshot: await screenshot(page, '01-live-photo-home') });

    report.createdProductId = await ensureProduct(page, TEST_IMAGE);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="live-photo-page"]', { timeout: 30000 });

    await page.evaluate((testImage) => {
      window.__VG_TEST_pickFiles = async () => [testImage];
    }, TEST_IMAGE);
    await page.evaluate((dir) => {
      window.__VG_TEST_pickDir = async () => dir;
    }, exportDir);

    await page.selectOption('[data-testid="live-photo-product-select"]', report.createdProductId);
    await page.click('[data-testid="live-photo-pick-reference"]');
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-testid="live-photo-reference-path"]');
      return Boolean(input && String(input.value || '').trim().length > 0);
    }, { timeout: 30000 });
    report.steps.push({ step: 'reference-picked', screenshot: await screenshot(page, '02-reference-picked') });

    await page.click('[data-testid="live-photo-create-reference"]');
    await page.click('[data-testid="live-photo-tab-library"]');
    await page.waitForFunction(() => {
      return document.querySelectorAll('[data-testid^="live-photo-item-"]').length >= 1;
    }, { timeout: 30000 });
    report.steps.push({ step: 'item-created', screenshot: await screenshot(page, '03-item-created') });

    const firstItemId = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid^="live-photo-item-"]'));
      const firstCard = cards[0];
      if (!firstCard) return '';
      return String(firstCard.getAttribute('data-testid') || '').replace('live-photo-item-', '');
    });
    assert.ok(firstItemId, 'Expected a created Live Photo item');
    await waitFor(
      async () =>
        await page.evaluate(async (itemId) => {
          const items = await window.api.livePhoto.list();
          return items.some((item) => item.id === itemId && item.packagingStatus === 'completed');
        }, firstItemId),
      90000,
    );

    await page.click(`[data-testid="live-photo-select-${firstItemId}"]`);
    await page.click('[data-testid="live-photo-export-selected"]');
    await waitFor(() => {
      if (!fs.existsSync(exportDir)) return false;
      const dirs = fs.readdirSync(exportDir, { withFileTypes: true }).filter((item) => item.isDirectory());
      if (!dirs.length) return false;
      return dirs.some((dir) => {
        const bundleDir = path.join(exportDir, dir.name);
        const files = fs.readdirSync(bundleDir);
        return files.some((item) => item.endsWith('.livephoto.json')) && files.some((item) => item.endsWith('.asset-metadata.json'));
      });
    }, 30000);
    await page.waitForSelector(`[data-testid="live-photo-metadata-${firstItemId}"]`, { timeout: 30000 });
    report.steps.push({ step: 'item-exported', screenshot: await screenshot(page, '04-item-exported') });

    const exportedDirs = fs.readdirSync(exportDir, { withFileTypes: true }).filter((item) => item.isDirectory());
    assert.ok(exportedDirs.length >= 1, 'Expected exported Live Photo bundle directory');
    const selectedDir =
      exportedDirs.find((item) => {
        const bundleDir = path.join(exportDir, item.name);
        const files = fs.readdirSync(bundleDir);
        return files.some((entry) => entry.endsWith('.livephoto.json'));
      }) || exportedDirs[0];
    const firstBundleDir = path.join(exportDir, selectedDir.name);
    const bundleFiles = fs.readdirSync(firstBundleDir);
    assert.ok(bundleFiles.some((item) => item.endsWith('.livephoto.json')), 'Expected .livephoto.json bundle file');
    assert.ok(bundleFiles.some((item) => item.endsWith('.asset-metadata.json')), 'Expected metadata bridge file');

    const metadataButton = page.locator(`[data-testid="live-photo-metadata-${firstItemId}"]`);
    assert.equal(await metadataButton.isVisible(), true);
    assert.equal(await metadataButton.isDisabled(), false);

    report.bundleDir = firstBundleDir;
    report.bundleFiles = bundleFiles;
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      await page.evaluate(() => {
        delete window.__VG_TEST_pickFiles;
        delete window.__VG_TEST_pickDir;
      });
    } catch {}
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[live-photo-desktop] failed:', error);
  process.exitCode = 1;
});
