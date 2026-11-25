import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * 单机 SQLite（WAL）。单实例部署足够支撑早期商业规模；
 * 所有 SQL 都集中在 repo.ts，后续换 MySQL / Postgres 只需替换这一层。
 */
export type CloudDb = DatabaseSync

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        account TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        plan_code TEXT,
        plan_expires_at INTEGER,
        unlimited INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        client TEXT NOT NULL,
        machine_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        machine_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        platform TEXT NOT NULL DEFAULT '',
        app_version TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked_at INTEGER,
        revoked_by TEXT
      );
      CREATE INDEX idx_devices_user ON devices(user_id, revoked_at);
      CREATE TABLE plans (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        days INTEGER NOT NULL,
        amount_fen INTEGER NOT NULL,
        max_devices INTEGER NOT NULL DEFAULT 1,
        features TEXT NOT NULL DEFAULT '["*"]',
        active INTEGER NOT NULL DEFAULT 1,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE orders (
        order_no TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        plan_code TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        days INTEGER NOT NULL,
        amount_fen INTEGER NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        qr_content TEXT NOT NULL DEFAULT '',
        transaction_id TEXT,
        paid_amount_fen INTEGER,
        paid_at INTEGER,
        paid_source TEXT,
        expire_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        refunded_at INTEGER,
        note TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_orders_user ON orders(user_id, created_at);
      CREATE INDEX idx_orders_status ON orders(status, created_at);
      CREATE TABLE redeem_codes (
        code TEXT PRIMARY KEY,
        plan_code TEXT NOT NULL,
        days INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'unused',
        batch_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT,
        created_at INTEGER NOT NULL,
        used_by TEXT,
        used_at INTEGER
      );
      CREATE INDEX idx_redeem_batch ON redeem_codes(batch_id);
      CREATE TABLE app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'public',
        description TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        updated_by TEXT
      );
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id TEXT,
        actor_account TEXT,
        action TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT 'null',
        ip TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_audit_created ON audit_logs(created_at);
    `,
  },
  {
    id: 2,
    sql: `
      CREATE TABLE sync_records (
        user_id TEXT NOT NULL REFERENCES users(id),
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        seq INTEGER NOT NULL,
        server_updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, collection, id)
      );
      CREATE INDEX idx_sync_records_seq ON sync_records(user_id, seq);
      CREATE TABLE sync_files (
        user_id TEXT NOT NULL REFERENCES users(id),
        id TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
    `,
  },
  {
    id: 3,
    sql: `
      CREATE TABLE ai_usage (
        user_id TEXT NOT NULL REFERENCES users(id),
        day TEXT NOT NULL,
        purpose TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, purpose)
      );
    `,
  },
  {
    id: 4,
    sql: `
      CREATE TABLE ai_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        output_file_id TEXT,
        output_mime TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_ai_jobs_user ON ai_jobs(user_id, created_at);
    `,
  },
  {
    id: 5,
    sql: `ALTER TABLE ai_jobs ADD COLUMN result TEXT;`,
  },
  {
    // 点数计费：钱包、流水、生成冻结记录、模型价目；套餐 / 订单 / 卡密带上点数
    id: 6,
    sql: `
      ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE plans ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE plans ADD COLUMN quotas TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE orders ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE redeem_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'plan';
      ALTER TABLE redeem_codes ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE redeem_codes ADD COLUMN expires_at INTEGER;
      ALTER TABLE redeem_codes ADD COLUMN channel TEXT NOT NULL DEFAULT '';
      ALTER TABLE ai_jobs ADD COLUMN hold_id TEXT;
      CREATE TABLE credit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),
        delta INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        actor_user_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, id);
      CREATE TABLE usage_holds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        capability TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT '',
        feature TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        month TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        settled_at INTEGER
      );
      CREATE INDEX idx_usage_holds_user_month ON usage_holds(user_id, month, capability);
      CREATE INDEX idx_usage_holds_status ON usage_holds(status, created_at);
      CREATE INDEX idx_usage_holds_created ON usage_holds(created_at);
      CREATE TABLE ai_models (
        id TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT '*',
        model TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        points INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        plan_codes TEXT NOT NULL DEFAULT '[]',
        sort INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (capability, platform, model)
      );
    `,
  },
  {
    // 首次部署自动创建的管理员：登录后必须先改密码
    id: 7,
    sql: `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    // AI 修图 · 批量换景
    id: 8,
    sql: `
      CREATE TABLE scene_swap_scenes (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        is_system INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        file_id TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_scene_swap_scenes_owner ON scene_swap_scenes(owner_id);
      CREATE INDEX idx_scene_swap_scenes_file ON scene_swap_scenes(file_id);
      CREATE TABLE scene_swap_batches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_scene_swap_batches_user ON scene_swap_batches(user_id, created_at);
      CREATE TABLE scene_swap_items (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES scene_swap_batches(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        ord INTEGER NOT NULL,
        status TEXT NOT NULL,
        trial INTEGER NOT NULL DEFAULT 0,
        hold_id TEXT,
        output_file_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_scene_swap_items_batch ON scene_swap_items(batch_id, ord);
      CREATE INDEX idx_scene_swap_items_status ON scene_swap_items(status);
      CREATE INDEX idx_scene_swap_items_user ON scene_swap_items(user_id, status);
    `,
  },
  {
    // AI 修图 · 模特：和场景同一张表（读图权限、清理规则相同），用 kind 区分
    id: 9,
    sql: `
      ALTER TABLE scene_swap_scenes ADD COLUMN kind TEXT NOT NULL DEFAULT 'scene';
      ALTER TABLE scene_swap_scenes ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
    `,
  },
]

export function openCloudDb(path: string): CloudDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map((row) => Number(row.id)),
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    transaction(db, () => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, Date.now())
    })
  }
  return db
}

/** 同步事务：node:sqlite 是同步 API，单进程内天然串行，事务内不要 await */
export function transaction<T>(db: CloudDb, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
