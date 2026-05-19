const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.WEB_NEXT_BASE_URL || 'http://127.0.0.1:18280';
const API_URL = process.env.WEB_API_BASE_URL || 'http://127.0.0.1:18080';
const PHONE = process.env.WEB_NEXT_TEST_PHONE || '13800138000';
const CODE = process.env.WEB_NEXT_TEST_CODE || '123456';
const DISPLAY_NAME = process.env.WEB_NEXT_TEST_DISPLAY_NAME || '自动化测试用户';
const ARTIFACT_DIR = path.join(ROOT, 'test', 'artifacts', 'web-next-clone-flow');
const REQUEST_TIMEOUT_MS = Number(process.env.WEB_NEXT_TEST_TIMEOUT_MS || 180000);
const POLL_INTERVAL_MS = 5000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowStamp() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function findFirstExistingFile(patterns) {
  for (const value of patterns) {
    if (!value) continue;
    if (fs.existsSync(value) && fs.statSync(value).isFile()) return value;
  }
  return '';
}

function listFilesRecursive(rootDir, exts) {
  const result = [];
  if (!fs.existsSync(rootDir)) return result;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (exts.has(path.extname(entry.name).toLowerCase())) {
        result.push(full);
      }
    }
  }
  return result;
}

function pickReferenceVideo() {
  const direct = findFirstExistingFile([
    path.join(ROOT, '.videogenerate', 'viral-clone', 'b79f1d94-1ada-43e6-8136-3a42c7b3a411', 'outputs', 'viral_clone_001.mp4'),
    path.join(ROOT, '.videogenerate', 'viral-clone', 'b79f1d94-1ada-43e6-8136-3a42c7b3a411', 'outputs', 'job_001_try_1', 'joined.mp4'),
  ]);
  if (direct) return direct;
  const all = listFilesRecursive(path.join(ROOT, '.videogenerate'), new Set(['.mp4', '.mov', '.avi', '.mkv']));
  return all[0] || '';
}

function pickProductImages() {
  const files = listFilesRecursive(path.join(ROOT, '.videogenerate'), new Set(['.jpg', '.jpeg', '.png', '.webp']));
  return files.slice(0, 3);
}

async function waitForHttp(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 401 || response.status === 404) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${label} 未在 60 秒内就绪: ${url}`);
}

async function screenshot(page, name) {
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function waitForCondition(fn, label, timeoutMs = REQUEST_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = String(error && error.message ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`${label} 超时${lastError ? `: ${lastError}` : ''}`);
}

async function getJson(page, endpointPath) {
  return await page.evaluate(async ({ endpointPath }) => {
    const token = window.localStorage.getItem('videogen.web.token') || '';
    const response = await fetch(`http://127.0.0.1:18080${endpointPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  }, { endpointPath });
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    artifactsDir: ARTIFACT_DIR,
    stages: [],
    status: 'running',
  };

  const referenceVideo = pickReferenceVideo();
  const productImages = pickProductImages();
  if (!referenceVideo) {
    throw new Error('未找到可用参考视频素材，请先准备本地真实视频文件。');
  }
  if (!productImages.length) {
    throw new Error('未找到可用商品图素材，请先准备本地真实商品图文件。');
  }

  report.referenceVideo = referenceVideo;
  report.productImages = productImages;

  await waitForHttp(`${API_URL}/me`, 'API 服务');
  await waitForHttp(`${BASE_URL}/login`, 'Web-Next 服务');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login?next=%2Fclone`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-phone-input').fill(PHONE);
    await page.getByRole('button', { name: /发送验证码|发送中/ }).click();
    await page.getByTestId('login-code-input').fill(CODE);
    await page.getByTestId('login-display-name-input').fill(DISPLAY_NAME);
    await page.getByTestId('login-submit-button').click();
    await page.waitForURL(/\/clone/, { timeout: 30000 });
    report.loginScreenshot = await screenshot(page, '01-after-login');

    await page.getByTestId('clone-create-task-button').click();
    await page.waitForURL(/\/clone\/[^/]+/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="clone-project-detail-page"]', { timeout: 30000 });
    const projectUrl = page.url();
    const projectId = projectUrl.split('/clone/')[1].split('?')[0];
    report.projectId = projectId;
    report.detailScreenshot = await screenshot(page, '02-project-created');

    await page.locator('[data-testid="reference-video-input"]').setInputFiles(referenceVideo);
    await page.locator('[data-testid="product-images-input"]').setInputFiles(productImages);
    await page.waitForTimeout(1500);

    await page.getByTestId('analyze-start-button').click();
    await waitForCondition(async () => {
      const res = await getJson(page, `/clone/projects/${encodeURIComponent(projectId)}`);
      const project = res.payload?.project || {};
      return project.analysis || project.analysisResult || project.referenceAnalysis || false;
    }, '参考视频分析完成');
    report.stages.push({ name: 'analyze', status: 'passed', screenshot: await screenshot(page, '03-analyze-complete') });

    await page.getByTestId('generate-script-variants-button').click();
    const selectedVariantId = await waitForCondition(async () => {
      const res = await getJson(page, `/clone/projects/${encodeURIComponent(projectId)}`);
      const project = res.payload?.project || {};
      const variants = Array.isArray(project.scriptVariants) ? project.scriptVariants : Array.isArray(project.executionBlueprint?.scriptCandidates) ? project.executionBlueprint.scriptCandidates : [];
      if (!variants.length) return '';
      return String(project.selectedScriptVariantId || project.selectedVariantId || variants[0].id || variants[0].variantId || '');
    }, '脚本候选生成完成');

    if (!selectedVariantId) {
      throw new Error('脚本候选生成成功但未拿到可选 variantId。');
    }
    const variantButton = page.getByTestId(`script-variant-option-${selectedVariantId}`);
    if (await variantButton.count()) {
      await variantButton.first().click();
    }
    report.stages.push({ name: 'script', status: 'passed', selectedVariantId, screenshot: await screenshot(page, '04-script-selected') });

    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
  } catch (error) {
    report.status = 'failed';
    report.finishedAt = new Date().toISOString();
    report.error = String(error && error.message ? error.message : error);
    try {
      report.failureScreenshot = await screenshot(page, `failed-${nowStamp()}`);
    } catch {}
    throw error;
  } finally {
    fs.writeFileSync(path.join(ARTIFACT_DIR, `report-${nowStamp()}.json`), JSON.stringify(report, null, 2), 'utf8');
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[web-next-clone-flow] failed:', error);
  process.exitCode = 1;
});
