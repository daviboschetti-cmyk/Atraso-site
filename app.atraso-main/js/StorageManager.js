/**
 * StorageManager.js
 * Gerenciamento de Persistência Offline-First com IndexedDB
 * Garante que os registros sejam gravados mesmo sem conexão e sincronizados depois.
 */

const DB_NAME = 'LateTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

export class StorageManager {
  #db = null;

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('studentId', 'studentId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.#db = event.target.result;
        resolve(this);
      };

      request.onerror = (event) => {
        console.error('Falha ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Salva um registro no IndexedDB
   * @param {Object} record
   * @param {boolean} synced
   */
  async saveEntry(record, synced = navigator.onLine) {
    if (!this.#db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const item = {
        ...record,
        timestamp: record.timestamp instanceof Date ? record.timestamp.toISOString() : record.timestamp,
        classStartTime: record.classStartTime instanceof Date ? record.classStartTime.toISOString() : record.classStartTime,
        synced: Boolean(synced),
        savedAt: new Date().toISOString()
      };

      const request = store.put(item);
      request.onsuccess = () => resolve(item);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtém todos os registros armazenados
   */
  async getAllEntries() {
    if (!this.#db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result.map(r => ({
          ...r,
          timestamp: new Date(r.timestamp),
          classStartTime: new Date(r.classStartTime)
        }));
        resolve(records);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retorna os registros pendentes de sincronização
   */
  async getUnsyncedEntries() {
    const all = await this.getAllEntries();
    return all.filter(item => !item.synced);
  }

  /**
   * Marca registros como sincronizados
   * @param {string[]} ids
   */
  async markAsSynced(ids) {
    if (!this.#db) await this.init();
    const transaction = this.#db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const item = getReq.result;
          item.synced = true;
          item.syncedAt = new Date().toISOString();
          store.put(item);
        }
      };
    }
  }

  /**
   * Limpa o banco de dados local
   */
  async clearAll() {
    if (!this.#db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }
}
