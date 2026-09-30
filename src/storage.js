// SPDX-License-Identifier: MIT
export class Store {
  constructor(storage) { try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; } }
  read(key, fallback) { try { const value = JSON.parse(this.storage.getItem(`dopa-fit:${key}`)); return value ?? fallback; } catch { return fallback; } }
  write(key, value) { try { this.storage.setItem(`dopa-fit:${key}`, JSON.stringify(value)); return true; } catch { return false; } }
  history() { const records = this.read('history', []); return Array.isArray(records) ? records.filter(r => Number.isFinite(r.energy) && Number.isFinite(r.seconds) && typeof r.at === 'string').slice(0, 30) : []; }
  saveSession(record) { return this.write('history', [record, ...this.history()].slice(0, 30)); }
  clearHistory() { try { this.storage.removeItem('dopa-fit:history'); return true; } catch { return false; } }
}
