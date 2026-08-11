// Service Worker for Ephemeral P2P Media Streaming
// Serves progressive 206 Range Requests out of IndexedDB sequentially

const DB_NAME = 'beacon_share_db';
const CHUNK_SIZE = 256 * 1024; // 256 KB

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Fetch file metadata (total size and mime type) from sessions store
async function getFileMeta(peerId, fileIndex, filename) {
  try {
    const db = await openDB();
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    return new Promise((resolve) => {
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const sessions = getAllReq.result || [];
        
        // 1. Try exact peerId match with non-empty filesList
        const exactSession = sessions.find(s => s.peerId === peerId && s.filesList && s.filesList.length > 0);
        if (exactSession) {
          if (exactSession.filesList[fileIndex] && exactSession.filesList[fileIndex].size) {
            return resolve(exactSession.filesList[fileIndex]);
          }
          if (filename) {
            const match = exactSession.filesList.find(f => f.name === filename);
            if (match && match.size) return resolve(match);
          }
        }

        // 2. Fallback: scan any active session containing this fileIndex or filename
        for (const s of sessions) {
          if (s.filesList && s.filesList.length > 0) {
            if (s.filesList[fileIndex] && s.filesList[fileIndex].size) {
              return resolve(s.filesList[fileIndex]);
            }
            if (filename) {
              const match = s.filesList.find(f => f.name === filename);
              if (match && match.size) return resolve(match);
            }
          }
        }

        resolve(null);
      };
      getAllReq.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// Fetch a single 256KB chunk ArrayBuffer from IndexedDB by exact offset key
async function getChunk(peerId, fileIndex, offset) {
  try {
    const db = await openDB();
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const id = `${peerId}_${fileIndex}_${offset}`;
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result;
        if (res && res.chunk) return resolve(res.chunk);

        // Fallback 1: search by peer_file index
        const index = store.index('peer_file');
        const rangeReq = index.getAll(IDBKeyRange.only([peerId, fileIndex]));
        rangeReq.onsuccess = () => {
          const results = rangeReq.result || [];
          const matched = results.find(r => r.offset === offset);
          if (matched && matched.chunk) return resolve(matched.chunk);

          // Fallback 2: scan all chunks for matching fileIndex and offset
          const getAllChunksReq = store.getAll();
          getAllChunksReq.onsuccess = () => {
            const allChunks = getAllChunksReq.result || [];
            const found = allChunks.find(c => c.fileIndex === fileIndex && c.offset === offset);
            resolve(found ? found.chunk : null);
          };
          getAllChunksReq.onerror = () => resolve(null);
        };
        rangeReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

function getMimeType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    mov: 'video/quicktime', avi: 'video/x-msvideo', m4v: 'video/mp4',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.startsWith('/ephemeral-p2p-stream/')) {
    return;
  }

  event.respondWith(handleStreamRequest(event.request, url));
});

async function handleStreamRequest(request, url) {
  const pathParts = url.pathname.replace('/ephemeral-p2p-stream/', '').split('/');
  if (pathParts.length < 3) {
    return new Response('Invalid stream URL', { status: 400 });
  }

  const peerId = decodeURIComponent(pathParts[0]);
  const fileIndex = parseInt(pathParts[1], 10);
  const filename = decodeURIComponent(pathParts[2]);

  const fileMeta = await getFileMeta(peerId, fileIndex, filename);
  if (!fileMeta || !fileMeta.size) {
    return new Response('File metadata not found in session DB', { status: 404 });
  }

  const totalSize = fileMeta.size;
  const mimeType = getMimeType(filename);
  const rangeHeader = request.headers.get('Range');

  let startByte = 0;
  let endByte = totalSize - 1;
  let isPartial = false;

  if (rangeHeader) {
    const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (rangeMatch) {
      isPartial = true;
      startByte = parseInt(rangeMatch[1], 10);
      if (rangeMatch[2]) {
        endByte = parseInt(rangeMatch[2], 10);
      }
    }
  }

  if (endByte >= totalSize) {
    endByte = totalSize - 1;
  }

  if (startByte >= totalSize) {
    return new Response('Requested Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` }
    });
  }

  const contentLength = endByte - startByte + 1;

  // Stream readable chunks sequentially with range-slicing
  const stream = new ReadableStream({
    async start(controller) {
      const startChunkIndex = Math.floor(startByte / CHUNK_SIZE);
      const endChunkIndex = Math.floor(endByte / CHUNK_SIZE);

      for (let i = startChunkIndex; i <= endChunkIndex; i++) {
        const chunkOffset = i * CHUNK_SIZE;

        if (request.signal && request.signal.aborted) {
          try { controller.close(); } catch (e) {}
          return;
        }

        let chunkData = await getChunk(peerId, fileIndex, chunkOffset);

        if (!chunkData) {
          // Poll IndexedDB until sequential chunk arrives
          let pollCount = 0;
          while (!chunkData && pollCount < 150) {
            if (request.signal && request.signal.aborted) {
              try { controller.close(); } catch (e) {}
              return;
            }
            await new Promise((r) => setTimeout(r, 200));
            chunkData = await getChunk(peerId, fileIndex, chunkOffset);
            pollCount++;
          }
        }

        if (!chunkData) {
          // If transfer paused or stopped before chunk arrived, finish stream
          try { controller.close(); } catch (e) {}
          return;
        }

        const chunkStartInFile = chunkOffset;
        const sliceStart = Math.max(0, startByte - chunkStartInFile);
        const sliceEnd = Math.min(chunkData.byteLength, endByte - chunkStartInFile + 1);

        const slicedChunk = chunkData.slice(sliceStart, sliceEnd);
        controller.enqueue(new Uint8Array(slicedChunk));
      }

      try { controller.close(); } catch (e) {}
    }
  });

  const responseHeaders = {
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength.toString(),
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  if (isPartial) {
    responseHeaders['Content-Range'] = `bytes ${startByte}-${endByte}/${totalSize}`;
    return new Response(stream, {
      status: 206,
      statusText: 'Partial Content',
      headers: responseHeaders,
    });
  } else {
    return new Response(stream, {
      status: 200,
      statusText: 'OK',
      headers: responseHeaders,
    });
  }
}
