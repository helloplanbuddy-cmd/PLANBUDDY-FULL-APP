// ============================================================
// lib/offlineDB.ts — IndexedDB offline-first persistence layer
// Phase 2: DB_VERSION bumped to 2 (adds userId ownership index)
// Migration: adds userId index to trips/expenses/memories
// ============================================================

const DB_NAME    = 'planbuddy-offline';
const DB_VERSION = 2; // Bump when schema changes

export type OfflineStore =
  | 'trips'
  | 'expenses'
  | 'memories'
  | 'notes'
  | 'hotels'
  | 'emergencyContacts'
  | 'syncQueue';

export interface SyncQueueItem {
  id: string;
  store: OfflineStore;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  timestamp: number;
  retries: number;
  userId?: string;
}

// ─── DB init & migrations ─────────────────────────────────

let _db: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db      = (e.target as IDBOpenDBRequest).result;
      const oldVer  = e.oldVersion;

      // ── Version 1 → baseline schema ────────────────────
      if (oldVer < 1) {
        const stores: Array<{ name: OfflineStore; keyPath: string; indexes?: string[] }> = [
          { name: 'trips',             keyPath: 'id', indexes: ['status', 'updatedAt'] },
          { name: 'expenses',          keyPath: 'id', indexes: ['tripId', 'date'] },
          { name: 'memories',          keyPath: 'id', indexes: ['tripId', 'createdAt'] },
          { name: 'notes',             keyPath: 'id', indexes: ['tripId'] },
          { name: 'hotels',            keyPath: 'id', indexes: ['tripId'] },
          { name: 'emergencyContacts', keyPath: 'id' },
          { name: 'syncQueue',         keyPath: 'id', indexes: ['timestamp'] },
        ];
        for (const s of stores) {
          if (!db.objectStoreNames.contains(s.name)) {
            const store = db.createObjectStore(s.name, { keyPath: s.keyPath });
            for (const idx of s.indexes ?? []) store.createIndex(idx, idx);
          }
        }
      }

      // ── Version 2 → add userId index for multi-user safety ──
      if (oldVer < 2) {
        const tx = (e.target as IDBOpenDBRequest).transaction!;
        const userOwned: OfflineStore[] = ['trips', 'expenses', 'memories', 'notes'];
        for (const storeName of userOwned) {
          if (db.objectStoreNames.contains(storeName)) {
            const store = tx.objectStore(storeName);
            if (!store.indexNames.contains('userId')) {
              store.createIndex('userId', 'userId');
            }
          }
        }
        // Add userId index to syncQueue
        if (db.objectStoreNames.contains('syncQueue')) {
          const store = tx.objectStore('syncQueue');
          if (!store.indexNames.contains('userId')) {
            store.createIndex('userId', 'userId');
          }
        }
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror   = () => reject(req.error);
  });
}

// ─── Generic CRUD ─────────────────────────────────────────

export async function dbGet<T>(store: OfflineStore, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbGetAll<T>(store: OfflineStore): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbGetByIndex<T>(
  store: OfflineStore,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const req   = index.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbPut<T extends { id: string }>(store: OfflineStore, item: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(item);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function dbDelete(store: OfflineStore, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function dbClear(store: OfflineStore): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── Sync queue ───────────────────────────────────────────

export async function enqueueSyncOp(
  store: OfflineStore,
  operation: SyncQueueItem['operation'],
  payload: unknown,
  userId?: string
): Promise<void> {
  const item: SyncQueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    store,
    operation,
    payload,
    timestamp: Date.now(),
    retries: 0,
    userId,
  };
  await dbPut('syncQueue', item as SyncQueueItem & { id: string });
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return dbGetAll<SyncQueueItem>('syncQueue');
}

export async function removeSyncItem(id: string): Promise<void> {
  return dbDelete('syncQueue', id);
}

// ─── Hydrate from Zustand store ───────────────────────────

export async function hydrateOfflineDB(zustandState: {
  trips:    Array<{ id: string }>;
  expenses: Array<{ id: string }>;
  memories: Array<{ id: string }>;
}): Promise<void> {
  try {
    const ops: Promise<void>[] = [
      ...zustandState.trips.map((t)    => dbPut('trips',    t as { id: string })),
      ...zustandState.expenses.map((e) => dbPut('expenses', e as { id: string })),
      ...zustandState.memories.map((m) => dbPut('memories', m as { id: string })),
    ];
    await Promise.all(ops);
  } catch (err) {
    console.warn('[offlineDB] Hydration failed:', err);
  }
}
