// 打包「内部不限制版」：授权模式 off，安装包名带 Internal，避免和商业版混淆。
import { spawnSync } from 'node:child_process'

const env = { ...process.env, VG_LICENSE_MODE: 'off' }
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', ...process.argv.slice(2), '-c.win.artifactName=${productName}-${version}-Internal-Setup.${ext}'])
