/**
 * PM2 进程配置：云端服务 + 官网 / 用户中心 / 管理后台。
 * 用法（在服务器的项目根目录）：pm2 start services/cloud/deploy/ecosystem.config.cjs && pm2 save
 */
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')

module.exports = {
  apps: [
    {
      name: 'tiktokcut-cloud',
      cwd: root,
      script: 'node_modules/.bin/tsx',
      args: '--env-file=/srv/tiktokcut/cloud.env services/cloud/server.ts',
      interpreter: 'none',
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'tiktokcut-web',
      cwd: path.join(root, 'apps/web-next'),
      script: '../../node_modules/.bin/next',
      args: 'start --hostname 127.0.0.1 --port 18280',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '768M',
      time: true,
    },
  ],
}
