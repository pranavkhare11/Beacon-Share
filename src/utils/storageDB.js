// IndexedDB Storage Engine for Beacon Share P2P Persistence
const DB_NAME = 'beacon_share_db';
const DB_VERSION = 1;

let dbPromise = null;

const getDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'peerId' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('peer_file', ['peerId', 'fileIndex'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.warn('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
};

// Save session metadata (file progress, peer ID, pin)
export async function saveSession(peerId, pin, filesList) {
  try {
    const db = await getDB();
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    
    // Strip non-serializable properties from filesList
    const serializableFiles = filesList.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      status: f.status,
      error: f.error
    }));

    await store.put({
      peerId,
      pin: pin || '',
      filesList: serializableFiles,
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('Failed to save session to IndexedDB:', err);
  }
}

// Retrieve active session metadata if within 15-minute grace window
export async function getSession(peerId) {
  try {
    const db = await getDB();
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    
    return new Promise((resolve) => {
      const request = store.get(peerId);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) return resolve(null);
        // Expire sessions older than 15 minutes
        if (Date.now() - result.timestamp > 15 * 60 * 1000) {
          clearSession(peerId);
          return resolve(null);
        }
        resolve(result);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// Save chunk buffer to IndexedDB
export async function saveChunk(peerId, fileIndex, offset, arrayBuffer) {
  try {
    const db = await getDB();
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    const id = `${peerId}_${fileIndex}_${offset}`;
    
    await store.put({
      id,
      peerId,
      fileIndex,
      offset,
      chunk: arrayBuffer
    });
  } catch (err) {
    console.warn('Failed to save chunk to IndexedDB:', err);
  }
}

// Retrieve all stored chunks for a specific file index, sorted by offset
export async function getChunksForFile(peerId, fileIndex) {
  try {
    const db = await getDB();
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const index = store.index('peer_file');
    
    return new Promise((resolve) => {
      const request = index.getAll(IDBKeyRange.only([peerId, fileIndex]));
      request.onsuccess = () => {
        const results = request.result || [];
        results.sort((a, b) => a.offset - b.offset);
        resolve(results.map(r => r.chunk));
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// Clear session and related chunk buffers
export async function clearSession(peerId) {
  try {
    const db = await getDB();
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    tx.objectStore('sessions').delete(peerId);
    
    const chunkStore = tx.objectStore('chunks');
    const index = chunkStore.index('peer_file');
    const request = index.getAllKeys(IDBKeyRange.bound([peerId, 0], [peerId, 9999]));
    request.onsuccess = () => {
      const keys = request.result || [];
      keys.forEach(k => chunkStore.delete(k));
    };
  } catch (err) {
    console.warn('Failed to clear session from IndexedDB:', err);
  }
}

// Clear all stored chunks for a specific file index only (used by REMOVE flush)
export async function clearChunksForFile(peerId, fileIndex) {
  try {
    const db = await getDB();
    const tx = db.transaction('chunks', 'readwrite');
    const chunkStore = tx.objectStore('chunks');
    const index = chunkStore.index('peer_file');
    return new Promise((resolve) => {
      const request = index.getAllKeys(IDBKeyRange.only([peerId, fileIndex]));
      request.onsuccess = () => {
        const keys = request.result || [];
        keys.forEach(k => chunkStore.delete(k));
        resolve();
      };
      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to clear chunks for file from IndexedDB:', err);
  }
}
