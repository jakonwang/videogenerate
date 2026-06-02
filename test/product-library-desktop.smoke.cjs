const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'test', 'artifacts', 'product-library-desktop');
const TEST_IMAGE =
  process.env.PRODUCT_LIBRARY_TEST_IMAGE ||
  path.join(ROOT, 'test', 'artifacts', 'web-next-clone-flow', '01-after-login.png');
const TEST_PHONE = process.env.PRODUCT_LIBRARY_TEST_PHONE || '13800138000';
const TEST_CODE = process.env.PRODUCT_LIBRARY_TEST_CODE || '123456';
const TEST_NAME = `商品库回归-${Date.now()}`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowStamp() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

async function screenshot(page, name) {
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function loginAndOpenProducts(page) {
  await page.waitForLoadState('domcontentloaded');
  const apiInfo = await page.evaluate(async () => window.api.getWebApiInfo());
  const baseUrl = String(apiInfo?.baseUrl || 'http://127.0.0.1:18080').trim();
  if (!baseUrl) throw new Error('未获取到本地 Web API 地址');

  const result = await page.evaluate(
    async ({ baseUrl, phone, code, displayName }) => {
      const sendRes = await fetch(`${baseUrl}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, channel: 'sms' }),
      });
      if (!sendRes.ok) {
        const payload = await sendRes.json().catch(() => ({}));
        throw new Error(String(payload?.error || `send-code failed: ${sendRes.status}`));
      }

      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, displayName }),
      });
      const payload = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok || payload?.ok === false || !payload?.token) {
        throw new Error(String(payload?.error || `login failed: ${loginRes.status}`));
      }

      localStorage.setItem('videogen-web-token', String(payload.token));
      location.hash = '#/products';
      return { token: String(payload.token), userId: String(payload.user?.id || '') };
    },
    { baseUrl, phone: TEST_PHONE, code: TEST_CODE, displayName: '桌面冒烟测试' },
  );

  if (!result?.token) throw new Error('登录后未获得 token');
  await page.waitForFunction(() => location.hash.includes('/products'));
  await page.waitForSelector('[data-testid="product-library-page"]', { timeout: 30000 });
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  if (!fs.existsSync(TEST_IMAGE)) {
    throw new Error(`测试图片不存在: ${TEST_IMAGE}`);
  }

  const report = {
    startedAt: new Date().toISOString(),
    testImage: TEST_IMAGE,
    createdProductId: '',
    status: 'running',
    checkpoints: [],
  };

  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();

  try {
    await loginAndOpenProducts(page);
    report.checkpoints.push({
      step: 'login',
      screenshot: await screenshot(page, '01-products-home'),
    });

    await page.click('[data-testid="product-create-submit"]');

    await page.waitForSelector('[data-testid="product-detail-page"]', { timeout: 30000 });
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="product-detail-name"]');
      return Boolean(node && String(node.textContent || '').trim().length > 0);
    });

    report.createdProductId = await page.evaluate(() => String(location.hash.split('/products/')[1] || '').trim());
    report.checkpoints.push({
      step: 'create-product',
      screenshot: await screenshot(page, '02-product-created'),
    });

    await page.evaluate((testImage) => {
      window.__VG_TEST_pickFiles = async () => [testImage];
    }, TEST_IMAGE);
    await page.click('[data-testid="product-upload-button"]');
    await page.waitForFunction(() => {
      return document.querySelectorAll('[data-testid^="product-image-card-"]').length >= 1;
    });
    report.checkpoints.push({
      step: 'upload-image',
      screenshot: await screenshot(page, '03-image-uploaded'),
    });

    await page.fill('[data-testid="product-remark-input"]', '桌面端商品库备注冒烟测试');
    await page.click('[data-testid="product-remark-save-button"]');
    await page.waitForFunction(() => {
      const feedback = document.querySelector('[data-testid="product-detail-feedback"]');
      return String(feedback?.textContent || '').includes('备注已保存');
    });
    report.checkpoints.push({
      step: 'save-remark',
      screenshot: await screenshot(page, '04-remark-saved'),
    });

    const productSnapshotAfterUpload = await page.evaluate(async () => {
      const list = await window.api.products.list();
      const target = list.find((item) => item.id === String(location.hash.split('/products/')[1] || '').trim());
      return {
        imageCount: Array.isArray(target?.images) ? target.images.length : 0,
        coverImagePath: String(target?.coverImagePath || ''),
        firstImageId: String(target?.images?.[0]?.id || ''),
      };
    });
    assert.equal(productSnapshotAfterUpload.imageCount, 1, '上传后图片数量应为 1');
    assert.ok(productSnapshotAfterUpload.coverImagePath, '上传后应自动生成封面');

    await page.click(`[data-testid="product-delete-image-${productSnapshotAfterUpload.firstImageId}"]`);
    await page.waitForSelector('[data-testid="product-images-empty"]', { timeout: 30000 });
    report.checkpoints.push({
      step: 'delete-image',
      screenshot: await screenshot(page, '05-image-deleted'),
    });

    const productSnapshotAfterDelete = await page.evaluate(async () => {
      const list = await window.api.products.list();
      const target = list.find((item) => item.id === String(location.hash.split('/products/')[1] || '').trim());
      return {
        imageCount: Array.isArray(target?.images) ? target.images.length : 0,
        coverImagePath: String(target?.coverImagePath || ''),
        remark: String(target?.remark || ''),
      };
    });

    assert.equal(productSnapshotAfterDelete.imageCount, 0, '删除最后一张图片后数量应为 0');
    assert.equal(productSnapshotAfterDelete.coverImagePath, '', '删除最后一张图片后封面应清空');
    assert.equal(productSnapshotAfterDelete.remark, '桌面端商品库备注冒烟测试', '备注应成功持久化');

    report.afterUpload = productSnapshotAfterUpload;
    report.afterDelete = productSnapshotAfterDelete;
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
  } catch (error) {
    report.status = 'failed';
    report.error = String(error && error.message ? error.message : error);
    report.finishedAt = new Date().toISOString();
    try {
      report.failureScreenshot = await screenshot(page, `failed-${nowStamp()}`);
    } catch {}
    throw error;
  } finally {
    try {
      if (report.createdProductId) {
        await page.evaluate(async (productId) => {
          await window.api.products.remove(productId);
        }, report.createdProductId);
      }
    } catch {}
    try {
      await page.evaluate(() => {
        delete window.__VG_TEST_pickFiles;
      });
    } catch {}
    fs.writeFileSync(path.join(ARTIFACT_DIR, `report-${nowStamp()}.json`), JSON.stringify(report, null, 2), 'utf8');
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[product-library-desktop] failed:', error);
  process.exitCode = 1;
});
