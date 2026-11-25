/**
 * 裁剪服务端镜像的依赖：node prune-runtime.mjs <含 package.json、package-lock.json、node_modules 的目录>
 * 去掉只有开发 / 打包桌面端才用的依赖，以及其它系统的二进制。
 */
import { readdirSync, readFileSync, rmSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages

/** 在 devDependencies 里、但服务器运行时要用的 */
const KEEP_DEV = [
  'tsx', // 启动命令
  'typescript', // Next 读取 next.config.ts
  'electron', // 复刻引擎跑电脑端源码，里面会引用（没有二进制，只是能解析到）
  'playwright', // 同上，按需引用
]
/** 最终镜像是 linux x64 glibc：这些用不上（路径相对 node_modules） */
const DROP = [
  'ffprobe-static/bin/darwin',
  'ffprobe-static/bin/win32',
  'ffprobe-static/bin/linux/ia32',
]

/** 按 Node 的查找规则，从 from 这个包往上找依赖 name 在 lock 里的位置 */
function locate(from, name) {
  for (let base = from; ; base = base.includes('/node_modules/') ? base.slice(0, base.lastIndexOf('/node_modules/')) : '') {
    const path = `${base ? `${base}/` : ''}node_modules/${name}`
    if (lock[path]) return path
    if (!base) return null
  }
}

const kept = new Set()
function keep(path) {
  if (!path || kept.has(path)) return
  kept.add(path)
  const pkg = lock[path]
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) keep(locate(path, name))
}
for (const name of KEEP_DEV) keep(locate('', name))

let removed = 0
const remove = (path) => {
  if (!existsSync(path)) return
  rmSync(path, { recursive: true, force: true })
  removed += 1
}
// 里面还嵌着要保留的包的目录不删
const dev = Object.keys(lock).filter((path) => path && lock[path].dev && !kept.has(path))
for (const path of dev) {
  if ([...kept].some((k) => k.startsWith(`${path}/`))) continue
  remove(join(root, path))
}
// musl 版原生包（Alpine 用）
for (const path of Object.keys(lock)) if (/linux(musl-x64|-x64-musl)$/.test(path)) remove(join(root, path))
for (const path of DROP) remove(join(root, 'node_modules', path))

// 清掉指向已删除包的命令链接
const bin = join(root, 'node_modules', '.bin')
for (const name of existsSync(bin) ? readdirSync(bin) : []) {
  const path = join(bin, name)
  if (!lstatSync(path).isSymbolicLink()) continue
  try {
    realpathSync(path)
  } catch {
    rmSync(path, { force: true })
  }
}
// 里面带项目版本号，会让依赖层每次发版都变
rmSync(join(root, 'node_modules', '.package-lock.json'), { force: true })
console.log(`removed ${removed} packages`)
