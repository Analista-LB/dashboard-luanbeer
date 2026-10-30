(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.PersistenceEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'ArgonComercialBI_DB';
  const DB_VERSION = 1;
  const STORES = ['state', 'history', 'custom_sources', 'snapshots'];

  // In-memory fallback for Node.js test environments or restricted private browsing
  const memoryStore = {
    state: new Map(),
    history: [],
    custom_sources: new Map(),
    snapshots: new Map()
  };

  function hasIndexedDB() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!hasIndexedDB()) {
        return resolve(null);
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (evt) {
        const db = evt.target.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = function (evt) {
        resolve(evt.target.result);
      };
      req.onerror = function (evt) {
        reject(evt.target.error || new Error('No se pudo abrir IndexedDB'));
      };
    });
  }

  async function putRecord(storeName, record) {
    const db = await openDB();
    if (!db) {
      if (storeName === 'history') {
        const idx = memoryStore.history.findIndex(x => x.id === record.id);
        if (idx >= 0) memoryStore.history[idx] = JSON.parse(JSON.stringify(record));
        else memoryStore.history.push(JSON.parse(JSON.stringify(record)));
      } else {
        memoryStore[storeName].set(record.id, JSON.parse(JSON.stringify(record)));
      }
      return record;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => { db.close(); resolve(record); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function getRecord(storeName, id) {
    const db = await openDB();
    if (!db) {
      if (storeName === 'history') return memoryStore.history.find(x => x.id === id) || null;
      return memoryStore[storeName].get(id) || null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function getAllRecords(storeName) {
    const db = await openDB();
    if (!db) {
      if (storeName === 'history') return [...memoryStore.history];
      return [...memoryStore[storeName].values()];
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function clearStore(storeName) {
    const db = await openDB();
    if (!db) {
      if (storeName === 'history') memoryStore.history.length = 0;
      else memoryStore[storeName].clear();
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function saveAppState(appState) {
    const record = {
      id: 'active_app_state',
      updatedAt: new Date().toISOString(),
      universeMode: appState.universeMode || 'REAL_14', // 'REAL_14' vs 'SINTETICO_PRUEBA'
      filters: appState.filters || {},
      preferences: appState.preferences || { activeMetric: 'hl', tableGroupBy: 'canal' },
      confirmedRelationships: appState.confirmedRelationships || [],
      columnMappings: appState.columnMappings || {},
      modelConfig: appState.modelConfig || { includePOP: true, deduplicateSales: true }
    };
    return putRecord('state', record);
  }

  async function loadAppState() {
    return getRecord('state', 'active_app_state');
  }

  async function recordImportOperation(entry) {
    const id = entry.id || `IMP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      id,
      timestamp: new Date().toISOString(),
      universeMode: entry.universeMode || 'REAL_14',
      actionType: entry.actionType || 'INGESTA_LOTE',
      filesCount: entry.filesCount || 0,
      fileNames: entry.fileNames || [],
      totalValidRows: entry.totalValidRows || 0,
      warningsCount: entry.warningsCount || 0,
      status: entry.status || 'CONFIRMADO',
      summary: entry.summary || ''
    };
    await putRecord('history', record);
    return record;
  }

  async function getImportHistory() {
    const list = await getAllRecords('history');
    return list.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }

  async function saveSnapshot(snapshotId, statePayload) {
    const rec = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      payload: JSON.parse(JSON.stringify(statePayload))
    };
    await putRecord('snapshots', rec);
    return rec;
  }

  async function restoreSnapshot(snapshotId) {
    const rec = await getRecord('snapshots', snapshotId);
    if (!rec) return null;
    await saveAppState(rec.payload);
    return rec.payload;
  }

  async function deleteRecord(storeName, id) {
    const db = await openDB();
    if (!db) {
      if (storeName === 'history') {
        const idx = memoryStore.history.findIndex(x => x.id === id);
        if (idx >= 0) memoryStore.history.splice(idx, 1);
      } else {
        memoryStore[storeName].delete(id);
      }
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  }

  async function saveCustomSource(sourceObj) {
    // If this custom source represents a monthly partition (REPLACE MONTH),
    // remove any previous record in custom_sources for the same partitionPeriod
    // so IndexedDB stores strictly the latest version of that month.
    if (sourceObj && sourceObj.partitionPeriod) {
      const existing = await getAllRecords('custom_sources');
      for (const item of existing) {
        if (item && item.partitionPeriod === sourceObj.partitionPeriod) {
          await deleteRecord('custom_sources', item.id);
        }
      }
    }
    const canonicalId = sourceObj.id || (sourceObj.partitionPeriod ? `PARTITION_${sourceObj.partitionPeriod}` : sourceObj.fileName);
    const rec = {
      ...sourceObj,
      id: canonicalId,
      importedAt: new Date().toISOString(),
      isSyntheticTest: Boolean(sourceObj.isSyntheticTest)
    };
    await putRecord('custom_sources', rec);
    return rec;
  }

  async function getCustomSources() {
    return getAllRecords('custom_sources');
  }

  async function clearTestAndCustomSources() {
    await clearStore('custom_sources');
    const state = await loadAppState();
    if (state) {
      state.universeMode = 'REAL_14';
      await saveAppState(state);
    }
    await recordImportOperation({
      universeMode: 'REAL_14',
      actionType: 'LIMPIEZA_DATOS_PRUEBA',
      filesCount: 14,
      fileNames: ['Restauración de las 14 fuentes reales originales del proyecto'],
      totalValidRows: 1226992,
      status: 'RESTAURADO',
      summary: 'Se eliminaron las fuentes de prueba/adicionales y se restableció el universo real de 14 archivos.'
    });
    return true;
  }

  return {
    DB_NAME,
    hasIndexedDB,
    saveAppState,
    loadAppState,
    recordImportOperation,
    getImportHistory,
    saveSnapshot,
    restoreSnapshot,
    saveCustomSource,
    getCustomSources,
    clearTestAndCustomSources
  };
});
