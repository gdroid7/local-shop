import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Feature flag: Connect to Turso Cloud (LibSQL) if credentials exist, otherwise local SQLite
const isTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'products.db');

let client;
let sqliteDb;

if (isTurso) {
  console.log('🌐 Connected to Persistent Turso Cloud Database:', process.env.TURSO_DATABASE_URL);
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
} else {
  console.log('💾 Connected to Local SQLite Database:', DB_PATH);
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('cache_size = -2000'); // 2MB RAM cache limit
  sqliteDb.pragma('temp_store = MEMORY');
}

export const db = {
  isTurso,

  async get(sql, params = []) {
    if (isTurso) {
      const res = await client.execute({ sql, args: params });
      return res.rows[0] || null;
    } else {
      return sqliteDb.prepare(sql).get(...params) || null;
    }
  },

  async all(sql, params = []) {
    if (isTurso) {
      const res = await client.execute({ sql, args: params });
      return res.rows;
    } else {
      return sqliteDb.prepare(sql).all(...params);
    }
  },

  async run(sql, params = []) {
    if (isTurso) {
      const res = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
        changes: Number(res.rowsAffected || 0)
      };
    } else {
      const info = sqliteDb.prepare(sql).run(...params);
      return {
        lastInsertRowid: info.lastInsertRowid,
        changes: info.changes
      };
    }
  },

  async exec(sql) {
    if (isTurso) {
      await client.executeMultiple(sql);
    } else {
      sqliteDb.exec(sql);
    }
  }
};

export async function initDb() {
  // 1. Users table (with social login and salt support)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL DEFAULT '',
      salt TEXT DEFAULT '',
      email TEXT DEFAULT '',
      google_id TEXT DEFAULT '',
      github_id TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for users columns if existing DB
  try {
    const userCols = await db.all('PRAGMA table_info(users)');
    const colNames = userCols.map(c => c.name);
    if (!colNames.includes('salt')) await db.exec('ALTER TABLE users ADD COLUMN salt TEXT DEFAULT ""');
    if (!colNames.includes('email')) await db.exec('ALTER TABLE users ADD COLUMN email TEXT DEFAULT ""');
    if (!colNames.includes('google_id')) await db.exec('ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT ""');
    if (!colNames.includes('github_id')) await db.exec('ALTER TABLE users ADD COLUMN github_id TEXT DEFAULT ""');
    if (!colNames.includes('avatar')) await db.exec('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ""');
  } catch (e) {
    // PRAGMA table_info may vary or table is fresh
  }

  // 2. Sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT (datetime('now', '+30 days')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    const sessionCols = await db.all('PRAGMA table_info(sessions)');
    const colNames = sessionCols.map(c => c.name);
    if (!colNames.includes('expires_at')) {
      await db.exec('ALTER TABLE sessions ADD COLUMN expires_at DATETIME DEFAULT NULL');
      await db.exec('UPDATE sessions SET expires_at = datetime("now", "+30 days") WHERE expires_at IS NULL');
    }
    await db.exec('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
  } catch (e) {
    console.error('Session migration notice:', e.message);
  }

  // 3. Workspaces table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    const wsCols = await db.all('PRAGMA table_info(workspaces)');
    if (!wsCols.find(c => c.name === 'user_id')) {
      await db.exec('ALTER TABLE workspaces ADD COLUMN user_id INTEGER DEFAULT 1');
    }
  } catch (_) {}

  // 4. Products table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT,
      workspace_id INTEGER DEFAULT 1,
      user_id INTEGER DEFAULT 1,
      url TEXT,
      title TEXT,
      image TEXT,
      price TEXT,
      size TEXT,
      is_favorite INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, workspace_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    const productCols = await db.all('PRAGMA table_info(products)');
    if (!productCols.find(c => c.name === 'user_id')) {
      await db.exec('ALTER TABLE products ADD COLUMN user_id INTEGER DEFAULT 1');
      await db.exec(`
        UPDATE products 
        SET user_id = (SELECT user_id FROM workspaces WHERE workspaces.id = products.workspace_id)
        WHERE user_id IS NULL OR user_id = 1
      `);
    }
  } catch (_) {}

  // 5. Multi-Tenant Indexes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
    CREATE INDEX IF NOT EXISTS idx_products_favorite ON products(user_id, is_favorite);
    CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_id);
  `);

  // Default admin user
  const admin = await db.get('SELECT id FROM users WHERE id = 1');
  if (!admin) {
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
    const hash = crypto.createHash('sha256').update(adminPassword).digest('hex');
    await db.run('INSERT INTO users (id, username, password) VALUES (1, ?, ?)', ['admin', hash]);
  }

  // Default workspace
  const defaultWs = await db.get('SELECT COUNT(*) as count FROM workspaces');
  if (!defaultWs || defaultWs.count === 0) {
    await db.run('INSERT INTO workspaces (name, user_id) VALUES (?, 1)', ['My Collection']);
  }
}
