import type {
  CloudAuditLog,
  CloudConfigEntry,
  CloudDevice,
  CloudFeature,
  CloudOrder,
  CloudOrderStatus,
  CloudPayChannel,
  CloudPlan,
  CloudRedeemCode,
  CloudRedeemStatus,
  CloudUser,
  CloudUserRole,
  CloudUserStatus,
} from '../../../src/shared/cloud/types'
import type { CloudDb } from './db'

type Row = Record<string, any>

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

export type UserRow = CloudUser & { passwordHash: string }

function mapUser(row: Row): UserRow {
  return {
    id: String(row.id),
    account: String(row.account),
    displayName: String(row.display_name ?? ''),
    role: row.role as CloudUserRole,
    status: row.status as CloudUserStatus,
    planCode: row.plan_code ? String(row.plan_code) : null,
    planExpiresAt: num(row.plan_expires_at),
    unlimited: Number(row.unlimited) === 1,
    createdAt: Number(row.created_at),
    lastLoginAt: num(row.last_login_at),
    passwordHash: String(row.password_hash),
  }
}

export function publicUser(user: UserRow): CloudUser {
  const { passwordHash: _ignored, ...rest } = user
  return rest
}

function mapDevice(row: Row): CloudDevice {
  return {
    id: String(row.id),
    machineId: String(row.machine_id),
    name: String(row.name ?? ''),
    platform: String(row.platform ?? ''),
    appVersion: String(row.app_version ?? ''),
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
  }
}

function mapPlan(row: Row): CloudPlan {
  return {
    code: String(row.code),
    name: String(row.name),
    description: String(row.description ?? ''),
    days: Number(row.days),
    amountFen: Number(row.amount_fen),
    maxDevices: Number(row.max_devices),
    features: parseJson<CloudFeature[]>(row.features, []),
    active: Number(row.active) === 1,
    sort: Number(row.sort ?? 0),
  }
}

function mapOrder(row: Row): CloudOrder {
  return {
    orderNo: String(row.order_no),
    userId: String(row.user_id),
    planCode: String(row.plan_code),
    planName: String(row.plan_name),
    days: Number(row.days),
    amountFen: Number(row.amount_fen),
    channel: row.channel as CloudPayChannel,
    status: row.status as CloudOrderStatus,
    qrContent: String(row.qr_content ?? ''),
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    paidAt: num(row.paid_at),
    expireAt: Number(row.expire_at),
    createdAt: Number(row.created_at),
    refundedAt: num(row.refunded_at),
    note: String(row.note ?? ''),
  }
}

function mapRedeem(row: Row): CloudRedeemCode {
  return {
    code: String(row.code),
    planCode: String(row.plan_code),
    days: Number(row.days),
    status: row.status as CloudRedeemStatus,
    batchId: String(row.batch_id),
    note: String(row.note ?? ''),
    createdAt: Number(row.created_at),
    usedBy: row.used_by ? String(row.used_by) : null,
    usedAt: num(row.used_at),
  }
}

function mapConfig(row: Row): CloudConfigEntry {
  return {
    key: String(row.key),
    value: parseJson<unknown>(row.value, null),
    scope: row.scope === 'private' ? 'private' : 'public',
    description: String(row.description ?? ''),
    updatedAt: Number(row.updated_at),
  }
}

function mapAudit(row: Row): CloudAuditLog {
  return {
    id: Number(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorAccount: row.actor_account ? String(row.actor_account) : null,
    action: String(row.action),
    target: String(row.target ?? ''),
    detail: parseJson<unknown>(row.detail, null),
    ip: String(row.ip ?? ''),
    createdAt: Number(row.created_at),
  }
}

function likeTerm(keyword: string) {
  return `%${keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

export function createRepo(db: CloudDb) {
  return {
    /* ---------------------------------------------------------- users */
    countUsers(): number {
      return Number((db.prepare('SELECT COUNT(*) AS n FROM users').get() as Row).n)
    },
    insertUser(input: { id: string; account: string; passwordHash: string; displayName: string; role: CloudUserRole; now: number }) {
      db.prepare(
        `INSERT INTO users (id, account, password_hash, display_name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).run(input.id, input.account, input.passwordHash, input.displayName, input.role, input.now, input.now)
    },
    getUserById(id: string): UserRow | null {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined
      return row ? mapUser(row) : null
    },
    getUserByAccount(account: string): UserRow | null {
      const row = db.prepare('SELECT * FROM users WHERE account = ?').get(account) as Row | undefined
      return row ? mapUser(row) : null
    },
    updateUser(id: string, patch: Partial<{
      displayName: string
      role: CloudUserRole
      status: CloudUserStatus
      unlimited: boolean
      planCode: string | null
      planExpiresAt: number | null
      passwordHash: string
      lastLoginAt: number
    }>, now: number) {
      const columns: Record<string, string> = {
        displayName: 'display_name',
        role: 'role',
        status: 'status',
        unlimited: 'unlimited',
        planCode: 'plan_code',
        planExpiresAt: 'plan_expires_at',
        passwordHash: 'password_hash',
        lastLoginAt: 'last_login_at',
      }
      const sets: string[] = []
      const values: Array<string | number | null> = []
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || !columns[key]) continue
        sets.push(`${columns[key]} = ?`)
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null))
      }
      if (!sets.length) return
      sets.push('updated_at = ?')
      values.push(now, id)
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    },
    listUsers(input: { keyword?: string; role?: string; status?: string; page: number; pageSize: number }) {
      const where: string[] = []
      const values: Array<string | number> = []
      if (input.keyword) {
        where.push("(account LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR id = ?)")
        values.push(likeTerm(input.keyword), likeTerm(input.keyword), input.keyword)
      }
      if (input.role) {
        where.push('role = ?')
        values.push(input.role)
      }
      if (input.status) {
        where.push('status = ?')
        values.push(input.status)
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM users ${clause}`).get(...values) as Row).n)
      const rows = db
        .prepare(`SELECT * FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...values, input.pageSize, (input.page - 1) * input.pageSize) as Row[]
      return { items: rows.map((row) => publicUser(mapUser(row))), total }
    },

    /* ---------------------------------------------------------- sessions */
    insertSession(input: { tokenHash: string; userId: string; client: string; machineId: string | null; now: number; expiresAt: number }) {
      db.prepare(
        `INSERT INTO sessions (token_hash, user_id, client, machine_id, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.tokenHash, input.userId, input.client, input.machineId, input.now, input.expiresAt, input.now)
    },
    getSession(tokenHash: string) {
      const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as Row | undefined
      if (!row) return null
      return {
        userId: String(row.user_id),
        client: String(row.client),
        machineId: row.machine_id ? String(row.machine_id) : null,
        expiresAt: Number(row.expires_at),
        lastSeenAt: Number(row.last_seen_at),
        revokedAt: num(row.revoked_at),
      }
    },
    touchSession(tokenHash: string, now: number) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash)
    },
    revokeSession(tokenHash: string, now: number) {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, tokenHash)
    },
    revokeUserSessions(userId: string, now: number, machineId?: string) {
      if (machineId) {
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND machine_id = ? AND revoked_at IS NULL').run(now, userId, machineId)
      } else {
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId)
      }
    },

    /* ---------------------------------------------------------- devices */
    listActiveDevices(userId: string): CloudDevice[] {
      return (db.prepare('SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC').all(userId) as Row[]).map(mapDevice)
    },
    getActiveDeviceByMachine(userId: string, machineId: string): CloudDevice | null {
      const row = db
        .prepare('SELECT * FROM devices WHERE user_id = ? AND machine_id = ? AND revoked_at IS NULL')
        .get(userId, machineId) as Row | undefined
      return row ? mapDevice(row) : null
    },
    getActiveDevice(userId: string, deviceId: string): CloudDevice | null {
      const row = db.prepare('SELECT * FROM devices WHERE user_id = ? AND id = ? AND revoked_at IS NULL').get(userId, deviceId) as Row | undefined
      return row ? mapDevice(row) : null
    },
    insertDevice(input: { id: string; userId: string; machineId: string; name: string; platform: string; appVersion: string; now: number }) {
      db.prepare(
        `INSERT INTO devices (id, user_id, machine_id, name, platform, app_version, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.id, input.userId, input.machineId, input.name, input.platform, input.appVersion, input.now, input.now)
    },
    touchDevice(id: string, input: { name: string; platform: string; appVersion: string; now: number }) {
      db.prepare('UPDATE devices SET last_seen_at = ?, name = ?, platform = ?, app_version = ? WHERE id = ?').run(
        input.now,
        input.name,
        input.platform,
        input.appVersion,
        id,
      )
    },
    revokeDevice(id: string, revokedBy: 'user' | 'admin', now: number) {
      db.prepare('UPDATE devices SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL').run(now, revokedBy, id)
    },
    countUserUnbindsSince(userId: string, since: number): number {
      return Number(
        (db.prepare("SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_by = 'user' AND revoked_at >= ?").get(userId, since) as Row).n,
      )
    },
    countActiveDevices(): number {
      return Number((db.prepare('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL').get() as Row).n)
    },

    /* ---------------------------------------------------------- plans */
    listPlans(includeInactive: boolean): CloudPlan[] {
      const sql = includeInactive ? 'SELECT * FROM plans ORDER BY sort, amount_fen' : 'SELECT * FROM plans WHERE active = 1 ORDER BY sort, amount_fen'
      return (db.prepare(sql).all() as Row[]).map(mapPlan)
    },
    getPlan(code: string): CloudPlan | null {
      const row = db.prepare('SELECT * FROM plans WHERE code = ?').get(code) as Row | undefined
      return row ? mapPlan(row) : null
    },
    upsertPlan(plan: CloudPlan, now: number) {
      db.prepare(
        `INSERT INTO plans (code, name, description, days, amount_fen, max_devices, features, active, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description, days = excluded.days,
           amount_fen = excluded.amount_fen, max_devices = excluded.max_devices, features = excluded.features,
           active = excluded.active, sort = excluded.sort, updated_at = excluded.updated_at`,
      ).run(
        plan.code,
        plan.name,
        plan.description,
        plan.days,
        plan.amountFen,
        plan.maxDevices,
        JSON.stringify(plan.features),
        plan.active ? 1 : 0,
        plan.sort,
        now,
        now,
      )
    },
    countPlans(): number {
      return Number((db.prepare('SELECT COUNT(*) AS n FROM plans').get() as Row).n)
    },

    /* ---------------------------------------------------------- orders */
    insertOrder(order: CloudOrder, now: number) {
      db.prepare(
        `INSERT INTO orders (order_no, user_id, plan_code, plan_name, days, amount_fen, channel, status, qr_content, expire_at, created_at, updated_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        order.orderNo,
        order.userId,
        order.planCode,
        order.planName,
        order.days,
        order.amountFen,
        order.channel,
        order.status,
        order.qrContent,
        order.expireAt,
        now,
        now,
        order.note,
      )
    },
    getOrder(orderNo: string): CloudOrder | null {
      const row = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo) as Row | undefined
      return row ? mapOrder(row) : null
    },
    markOrderPaid(input: { orderNo: string; transactionId: string; paidFen: number; source: string; now: number }) {
      db.prepare(
        `UPDATE orders SET status = 'paid', transaction_id = ?, paid_amount_fen = ?, paid_at = ?, paid_source = ?, updated_at = ?
         WHERE order_no = ? AND status = 'pending'`,
      ).run(input.transactionId, input.paidFen, input.now, input.source, input.now, input.orderNo)
    },
    setOrderStatus(orderNo: string, status: CloudOrderStatus, now: number, note?: string) {
      const refundedAt = status === 'refunded' ? now : null
      db.prepare(
        `UPDATE orders SET status = ?, updated_at = ?, refunded_at = COALESCE(?, refunded_at), note = COALESCE(?, note) WHERE order_no = ?`,
      ).run(status, now, refundedAt, note ?? null, orderNo)
    },
    listOrders(input: { userId?: string; status?: string; keyword?: string; page: number; pageSize: number }) {
      const where: string[] = []
      const values: Array<string | number> = []
      if (input.userId) {
        where.push('o.user_id = ?')
        values.push(input.userId)
      }
      if (input.status) {
        where.push('o.status = ?')
        values.push(input.status)
      }
      if (input.keyword) {
        where.push("(o.order_no LIKE ? ESCAPE '\\' OR u.account LIKE ? ESCAPE '\\' OR o.transaction_id = ?)")
        values.push(likeTerm(input.keyword), likeTerm(input.keyword), input.keyword)
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const from = 'FROM orders o JOIN users u ON u.id = o.user_id'
      const total = Number((db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...values) as Row).n)
      const rows = db
        .prepare(`SELECT o.*, u.account AS account ${from} ${clause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`)
        .all(...values, input.pageSize, (input.page - 1) * input.pageSize) as Row[]
      return { items: rows.map((row) => ({ ...mapOrder(row), account: String(row.account) })), total }
    },
    revenueSince(since: number): { count: number; fen: number } {
      const row = db
        .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(paid_amount_fen), 0) AS fen FROM orders WHERE status = 'paid' AND paid_at >= ?")
        .get(since) as Row
      return { count: Number(row.n), fen: Number(row.fen) }
    },
    listPaidSince(since: number): Array<{ paidAt: number; fen: number }> {
      return (db.prepare("SELECT paid_at, paid_amount_fen FROM orders WHERE status = 'paid' AND paid_at >= ?").all(since) as Row[]).map((row) => ({
        paidAt: Number(row.paid_at),
        fen: Number(row.paid_amount_fen ?? 0),
      }))
    },
    countActiveSubscribers(now: number): number {
      return Number(
        (db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active' AND (unlimited = 1 OR role = 'super_admin' OR plan_expires_at > ?)").get(now) as Row).n,
      )
    },
    countUsersSince(since: number): number {
      return Number((db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').get(since) as Row).n)
    },

    /* ---------------------------------------------------------- redeem codes */
    insertRedeemCode(input: { code: string; planCode: string; days: number; batchId: string; note: string; createdBy: string; now: number }) {
      db.prepare(
        `INSERT INTO redeem_codes (code, plan_code, days, status, batch_id, note, created_by, created_at)
         VALUES (?, ?, ?, 'unused', ?, ?, ?, ?)`,
      ).run(input.code, input.planCode, input.days, input.batchId, input.note, input.createdBy, input.now)
    },
    getRedeemCode(code: string): CloudRedeemCode | null {
      const row = db.prepare('SELECT * FROM redeem_codes WHERE code = ?').get(code) as Row | undefined
      return row ? mapRedeem(row) : null
    },
    markRedeemUsed(code: string, userId: string, now: number): boolean {
      const result = db.prepare("UPDATE redeem_codes SET status = 'used', used_by = ?, used_at = ? WHERE code = ? AND status = 'unused'").run(userId, now, code)
      return Number(result.changes) === 1
    },
    setRedeemStatus(code: string, status: CloudRedeemStatus) {
      db.prepare("UPDATE redeem_codes SET status = ? WHERE code = ? AND status != 'used'").run(status, code)
    },
    listRedeemCodes(input: { batchId?: string; status?: string; keyword?: string; page: number; pageSize: number }) {
      const where: string[] = []
      const values: Array<string | number> = []
      if (input.batchId) {
        where.push('batch_id = ?')
        values.push(input.batchId)
      }
      if (input.status) {
        where.push('status = ?')
        values.push(input.status)
      }
      if (input.keyword) {
        where.push("(code LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')")
        values.push(likeTerm(input.keyword), likeTerm(input.keyword))
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM redeem_codes ${clause}`).get(...values) as Row).n)
      const rows = db
        .prepare(`SELECT * FROM redeem_codes ${clause} ORDER BY created_at DESC, code LIMIT ? OFFSET ?`)
        .all(...values, input.pageSize, (input.page - 1) * input.pageSize) as Row[]
      return { items: rows.map(mapRedeem), total }
    },

    /* ---------------------------------------------------------- config */
    listConfig(scope?: 'public' | 'private'): CloudConfigEntry[] {
      const rows = scope
        ? (db.prepare('SELECT * FROM app_config WHERE scope = ? ORDER BY key').all(scope) as Row[])
        : (db.prepare('SELECT * FROM app_config ORDER BY key').all() as Row[])
      return rows.map(mapConfig)
    },
    upsertConfig(entry: { key: string; value: unknown; scope: 'public' | 'private'; description: string; updatedBy: string | null; now: number }) {
      db.prepare(
        `INSERT INTO app_config (key, value, scope, description, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, scope = excluded.scope, description = excluded.description,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      ).run(entry.key, JSON.stringify(entry.value ?? null), entry.scope, entry.description, entry.now, entry.updatedBy)
    },
    deleteConfig(key: string) {
      db.prepare('DELETE FROM app_config WHERE key = ?').run(key)
    },

    /* ---------------------------------------------------------- audit */
    insertAudit(input: { actorUserId: string | null; actorAccount: string | null; action: string; target: string; detail: unknown; ip: string; now: number }) {
      db.prepare(
        'INSERT INTO audit_logs (actor_user_id, actor_account, action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(input.actorUserId, input.actorAccount, input.action, input.target, JSON.stringify(input.detail ?? null), input.ip, input.now)
    },
    listAudit(input: { keyword?: string; page: number; pageSize: number }) {
      const values: Array<string | number> = []
      let clause = ''
      if (input.keyword) {
        clause = "WHERE action LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR actor_account LIKE ? ESCAPE '\\'"
        values.push(likeTerm(input.keyword), likeTerm(input.keyword), likeTerm(input.keyword))
      }
      const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM audit_logs ${clause}`).get(...values) as Row).n)
      const rows = db
        .prepare(`SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...values, input.pageSize, (input.page - 1) * input.pageSize) as Row[]
      return { items: rows.map(mapAudit), total }
    },
  }
}

export type CloudRepo = ReturnType<typeof createRepo>
