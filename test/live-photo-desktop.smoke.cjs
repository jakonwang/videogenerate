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
      window.__VG_TEST_pickDirCalled = 0;
      window.__VG_TEST_exportItemsCalled = 0;
      window.__VG_TEST_lastExportPayload = null;
      window.__VG_TEST_pickDir = async () => {
        window.__VG_TEST_pickDirCalled += 1;
        return dir;
      };
      const originalExportItems = window.api.livePhoto.exportItems;
      window.api.livePhoto.exportItems = async (payload) => {
        window.__VG_TEST_exportItemsCalled += 1;
        window.__VG_TEST_lastExportPayload = payload;
        return await originalExportItems(payload);
      };
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

    const firstItemCheck = page.locator(`[data-testid="live-photo-item-${firstItemId}"] .live-console-row__check span`);
    await firstItemCheck.click();
    await page.waitForFunction((itemId) => {
      const input = document.querySelector(`[data-testid="live-photo-select-${itemId}"]`);
      return Boolean(input && input.checked);
    }, firstItemId, { timeout: 30000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="live-photo-export-selected"]');
      return Boolean(button && !button.disabled);
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="live-photo-send-feishu"]');
      return Boolean(button && !button.disabled);
    }, { timeout: 30000 });
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="live-photo-export-selected"]');
      if (!button) throw new Error('Missing export selected button');
      button.click();
    });
    let exportedItem = null;
    try {
      exportedItem = await waitFor(
        async () =>
          await page.evaluate(async (itemId) => {
            const items = await window.api.livePhoto.list();
            return (
              items.find((item) => item.id === itemId && item.exportBundlePath && item.packagingMetadataBridgePath) || null
            );
          }, firstItemId),
        90000,
      );
    } catch (error) {
      const exportDebug = await page.evaluate(async (itemId) => {
        const items = await window.api.livePhoto.list();
        const target = items.find((item) => item.id === itemId) || null;
        const notice = document.querySelector('[data-testid="live-photo-notice"]')?.textContent || '';
        const errorText = document.querySelector('[data-testid="live-photo-error"]')?.textContent || '';
        const selected = document.querySelector(`[data-testid="live-photo-select-${itemId}"]`);
        const button = document.querySelector('[data-testid="live-photo-export-selected"]');
        let manualInvokeResult = null;
        let manualInvokeError = '';
        try {
        } catch (error) {
          manualInvokeError = error?.message || String(error || '');
        }
        return {
          notice,
          errorText,
          pickDirCalled: Number(window.__VG_TEST_pickDirCalled || 0),
          exportItemsCalled: Number(window.__VG_TEST_exportItemsCalled || 0),
          lastExportPayload: window.__VG_TEST_lastExportPayload || null,
          manualInvokeError,
          selectedChecked: Boolean(selected && selected.checked),
          exportButtonDisabled: Boolean(button && button.disabled),
          target,
        };
      }, firstItemId);
      console.error('[live-photo-desktop] export debug:', JSON.stringify(exportDebug, null, 2));
      throw error;
    }
    await page.waitForFunction((itemId) => {
      const button = document.querySelector(`[data-testid="live-photo-metadata-${itemId}"]`);
      return Boolean(button && !button.disabled);
    }, firstItemId, { timeout: 30000 });
    report.steps.push({ step: 'item-exported', screenshot: await screenshot(page, '04-item-exported') });

    const firstBundleDir = path.dirname(String(exportedItem.exportBundlePath || ''));
    assert.ok(fs.existsSync(firstBundleDir), 'Expected exported Live Photo bundle directory');
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
        delete window.__VG_TEST_pickDirCalled;
        delete window.__VG_TEST_exportItemsCalled;
        delete window.__VG_TEST_lastExportPayload;
      });
    } catch {}
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[live-photo-desktop] failed:', error);
  process.exitCode = 1;
});
