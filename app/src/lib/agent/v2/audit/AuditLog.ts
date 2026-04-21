import path from 'path';
import fs from 'fs';

// Lazy-load better-sqlite3 to avoid import errors if package missing
interface AuditDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

let db: AuditDb | null = null;

function getDb(): AuditDb {
  if (db) return db;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as new (filename: string) => AuditDb;
  const dbPath = process.env.AUDIT_DB_PATH ?? '/opt/complexity/data/audit.db';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        DATETIME DEFAULT CURRENT_TIMESTAMP,
      tier      INTEGER,
      tool      TEXT,
      params    TEXT,
      result    TEXT,
      user      TEXT DEFAULT 'agent'
    )
  `);
  return db;
}

export interface AuditEntry {
  id: number;
  ts: string;
  tier: number;
  tool: string;
  params: string;
  result: string;
  user: string;
}

export function auditWrite(tier: number, tool: string, params: unknown, result: string, user = 'agent'): void {
  try {
    const db = getDb();
    db.prepare('INSERT INTO audit_log (tier, tool, params, result, user) VALUES (?, ?, ?, ?, ?)')
      .run(tier, tool, JSON.stringify(params), result, user);
  } catch (err) {
    console.warn('[audit] write failed:', err);
  }
}

export interface AuditQueryOptions {
  limit?: number;
  tool?: string;
  tier?: number;
  since?: string;
}

export function auditQuery(opts: AuditQueryOptions = {}): AuditEntry[] {
  try {
    const db = getDb();
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: (string | number)[] = [];
    if (opts.tool)  { sql += ' AND tool = ?';     params.push(opts.tool); }
    if (opts.tier != null) { sql += ' AND tier = ?'; params.push(opts.tier); }
    if (opts.since) { sql += ' AND ts >= ?';       params.push(opts.since); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(opts.limit ?? 50);
    return db.prepare(sql).all(...params) as AuditEntry[];
  } catch (err) {
    console.warn('[audit] query failed:', err);
    return [];
  }
}
