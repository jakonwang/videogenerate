CREATE TABLE IF NOT EXISTS pc_rule_sets (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_projects (
  project_id TEXT PRIMARY KEY,
  compiler_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  last_compiled_at INTEGER,
  strict_mode_default INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_shot_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  product_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  strict_consistency_mode INTEGER NOT NULL,
  reference_priority_mode TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  compiled_negative_prompt TEXT NOT NULL,
  source_prompt_hash TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, shot_id)
);

CREATE TABLE IF NOT EXISTS pc_shot_anchors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  anchor_value TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_shot_risk_flags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  risk_flag TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_shot_patches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  patch_type TEXT NOT NULL,
  patch_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_shot_prompt_layers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  layer_priority INTEGER NOT NULL,
  layer_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pc_compilation_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  compiled_negative_prompt TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pc_shot_reports_project_shot
ON pc_shot_reports(project_id, shot_id);

CREATE INDEX IF NOT EXISTS idx_pc_shot_anchors_project_shot
ON pc_shot_anchors(project_id, shot_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_pc_shot_risk_flags_project_shot
ON pc_shot_risk_flags(project_id, shot_id);

CREATE INDEX IF NOT EXISTS idx_pc_shot_patches_project_shot
ON pc_shot_patches(project_id, shot_id);

CREATE INDEX IF NOT EXISTS idx_pc_shot_prompt_layers_project_shot
ON pc_shot_prompt_layers(project_id, shot_id, layer_priority);

CREATE INDEX IF NOT EXISTS idx_pc_compilation_history_project_shot
ON pc_compilation_history(project_id, shot_id, created_at DESC);
