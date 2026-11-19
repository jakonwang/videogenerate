/**
 * 部署时运行一次：下载 Remotion 渲染字幕用的无界面 Chrome（约 110 MB，放在 node_modules/.remotion）。
 * 不预先下载的话，第一位用户渲染字幕时会现场下载，要多等一两分钟。
 *
 *   npm run cloud:remotion-browser
 *
 * Linux 服务器还需要 Chrome 依赖的系统库（Debian / Ubuntu 示例）：
 *   apt-get install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2
 * 中文字幕字体：和服务器视频工具共用 CLOUD_FONTS_DIR（先运行 npm run setup:fonts）。
 */
import { ensureBrowser } from '@remotion/renderer'

async function main() {
  const started = Date.now()
  await ensureBrowser({ logLevel: 'info' })
  console.log(`Remotion browser ready (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
