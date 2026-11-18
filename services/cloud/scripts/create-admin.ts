/**
 * 创建或重置超级管理员（不受限账号）。
 * 用法：
 *   CLOUD_ADMIN_ACCOUNT=you@example.com CLOUD_ADMIN_PASSWORD='...' npm run cloud:create-admin
 * 密码只通过环境变量传入，避免留在命令历史 / 进程列表的参数里。
 */
import { loadCloudConfig } from '../src/config'
import { openCloudDb } from '../src/db'
import { createRepo } from '../src/repo'
import { hashPassword, newId, normalizeAccount, validatePassword } from '../src/security'

async function main() {
  const account = normalizeAccount(process.env.CLOUD_ADMIN_ACCOUNT || '')
  const password = process.env.CLOUD_ADMIN_PASSWORD || ''
  validatePassword(password)
  const config = loadCloudConfig()
  const db = openCloudDb(config.dbPath)
  const repo = createRepo(db)
  const now = Date.now()
  const passwordHash = await hashPassword(password)
  const existing = repo.getUserByAccount(account)
  if (existing) {
    repo.updateUser(existing.id, { role: 'super_admin', status: 'active', passwordHash, mustChangePassword: false }, now)
    repo.revokeUserSessions(existing.id, now)
    console.log(`已把 ${account} 设为超级管理员并重置密码`)
  } else {
    repo.insertUser({ id: newId('u'), account, passwordHash, displayName: account, role: 'super_admin', now })
    console.log(`已创建超级管理员 ${account}`)
  }
  repo.insertAudit({ actorUserId: null, actorAccount: 'cli', action: 'cli.create-admin', target: account, detail: null, ip: '', now })
  db.close()
}

main().catch((error) => {
  console.error(error?.message ?? error)
  process.exitCode = 1
})
