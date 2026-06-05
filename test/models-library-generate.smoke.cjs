const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'test', 'artifacts', 'models-library-generate');
const TEST_IMAGE =
  process.env.MODEL_LIBRARY_TEST_IMAGE ||
  path.join(ROOT, 'test', 'artifacts', 'product-library-desktop', '03-image-uploaded.png');
const TEST_PHONE = process.env.PRODUCT_LIBRARY_TEST_PHONE || '13800138000';
const TEST_CODE = process.env.PRODUCT_LIBRARY_TEST_CODE || '123456';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function screenshot(page, name) {
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function loginAndOpenModels(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[placeholder="请输入手机号"]', TEST_PHONE);
  await page.fill('input[placeholder="请输入验证码"]', TEST_CODE);
  const displayNameInput = page.locator('input[placeholder*="昵称"]').first();
  if (await displayNameInput.count()) {
    await displayNameInput.fill('桌面模特生成冒烟测试');
  }
  await page.click('button:has-text("登录并进入桌面端")');
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    location.hash = '#/models';
  });
  await page.waitForFunction(() => location.hash.includes('/models'));
  await page.waitForSelector('[data-testid="models-library-page"]', { timeout: 30000 });
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  if (!fs.existsSync(TEST_IMAGE)) {
    throw new Error(`测试图片不存在: ${TEST_IMAGE}`);
  }

  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  const report = { startedAt: new Date().toISOString(), testImage: TEST_IMAGE, steps: [] };

  try {
    await loginAndOpenModels(page);
    report.steps.push({ step: 'open-models', screenshot: await screenshot(page, '01-models-home') });

    await page.click('[data-testid="models-open-create"]');
    await page.waitForSelector('[data-testid="models-create-dialog"]', { timeout: 10000 });
    report.steps.push({ step: 'open-create-dialog', screenshot: await screenshot(page, '02-create-dialog') });

    await page.evaluate((testImage) => {
      window.__VG_TEST_pickFiles = async () => [testImage];
    }, TEST_IMAGE);

    await page.click('[data-testid="models-upload-main"]');
    await page.waitForFunction(() => {
      return document.querySelector('[data-testid="models-generate-submit"]')?.textContent?.trim().length > 0;
    });
    report.steps.push({ step: 'upload-main', screenshot: await screenshot(page, '03-main-uploaded') });

    const before = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="models-generate-submit"]');
      return {
        disabled: btn instanceof HTMLButtonElement ? btn.disabled : null,
        text: String(btn?.textContent || '').trim(),
      };
    });

    await page.click('[data-testid="models-generate-submit"]');
    await page.waitForTimeout(2500);

    const after = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="models-generate-submit"]');
      const toast = document.querySelector('.models-toast');
      return {
        disabled: btn instanceof HTMLButtonElement ? btn.disabled : null,
        text: String(btn?.textContent || '').trim(),
        toast: String(toast?.textContent || '').trim(),
        hash: String(location.hash || ''),
      };
    });

    report.before = before;
    report.after = after;
    report.steps.push({ step: 'after-generate-click', screenshot: await screenshot(page, '04-after-generate-click') });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      await page.evaluate(() => {
        delete window.__VG_TEST_pickFiles;
      });
    } catch {}
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[models-library-generate] failed:', error);
  process.exitCode = 1;
});
