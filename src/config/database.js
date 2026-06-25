const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const DB_PATH = process.env.DB_PATH || './data/urls.db';
const IN_MEMORY = DB_PATH === ':memory:';

let _db = null;
let _SQL = null;

/**
 * Synchronous wrapper around sql.js so the rest of the app
 * can use a better-sqlite3-compatible API (prepare / run / get / all / exec).
 */
class SyncDB {
  constructor(sqljs) {
    this._db = new sqljs.Database(this._loadFile());
    this._init();
  }

  _loadFile() {
    if (IN_MEMORY) return undefined;
    if (fs.existsSync(DB_PATH)) return new Uint8Array(fs.readFileSync(DB_PATH));
    return undefined;
  }

  _save() {
    if (IN_MEMORY) return;
    const data = this._db.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  _init() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS urls (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        short_code  TEXT    NOT NULL UNIQUE,
        original_url TEXT   NOT NULL,
        custom_slug TEXT    UNIQUE,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        click_count INTEGER NOT NULL DEFAULT 0,
        creator_ip  TEXT
      );

      CREATE TABLE IF NOT EXISTS analytics (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        url_id      INTEGER NOT NULL,
        clicked_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        referrer    TEXT,
        user_agent  TEXT,
        ip_address  TEXT,
        country     TEXT,
        FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_urls_short_code  ON urls(short_code);
      CREATE INDEX IF NOT EXISTS idx_urls_original    ON urls(original_url);
      CREATE INDEX IF NOT EXISTS idx_analytics_url_id ON analytics(url_id);
    `);
    this._save();
    logger.info(`Database ready${IN_MEMORY ? ' (in-memory)' : ` at ${DB_PATH}`}`);
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
    return this;
  }

  pragma() { return this; } // no-op: sql.js doesn't need pragma

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        self._db.run(sql, params);
        self._save();
        // Return lastInsertRowid
        const r = self._db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = r[0]?.values[0]?.[0] ?? null;
        return { lastInsertRowid, changes: self._db.getRowsModified() };
      },
      get(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const obj = stmt.getAsObject();
          stmt.free();
          return obj;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const stmt = self._db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
      },
    };
  }

  close() {
    this._save();
    this._db.close();
    _db = null;
  }
}

async function initializeDatabase() {
  if (!_SQL) {
    _SQL = await require('sql.js')();
  }
  return new SyncDB(_SQL);
}

function getDb() {
  if (!_db) {
    throw new Error('Database not initialized. Call await initDb() first.');
  }
  return _db;
}

async function initDb() {
  if (!_db) {
    _db = await initializeDatabase();
  }
  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, initDb, closeDb };