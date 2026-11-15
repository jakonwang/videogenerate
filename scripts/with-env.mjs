// 跨平台设置环境变量后执行命令：node scripts/with-env.mjs KEY=VALUE [KEY=VALUE...] -- <command...>
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
if (sep < 0 || sep === args.length - 1) {
  console.error('用法：node scripts/with-env.mjs KEY=VALUE -- <command>')
  process.exit(1)
}
const env = { ...process.env }
for (const pair of args.slice(0, sep)) {
  const i = pair.indexOf('=')
  if (i > 0) env[pair.slice(0, i)] = pair.slice(i + 1)
}
const [cmd, ...rest] = args.slice(sep + 1)
const result = spawnSync(cmd, rest, { stdio: 'inherit', env, shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
