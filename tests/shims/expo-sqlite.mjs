// expo-sqlite's async API on top of Node's built-in SQLite, so the app's real SQL runs in tests.
import { DatabaseSync } from 'node:sqlite';

class Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }
  async runAsync(sql, params = []) {
    const result = this.db.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes };
  }
  async getAllAsync(sql, params = []) {
    return this.db.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
  }
  async getFirstAsync(sql, params = []) {
    return this.db.prepare(sql).get(...(Array.isArray(params) ? params : [params])) ?? null;
  }
  async execAsync(sql) {
    this.db.exec(sql);
  }
}

export async function openDatabaseAsync() {
  return new Database();
}
