const DB_NAME = 'nura-browser-demo-files';
const STORE_NAME = 'assets';
const URI_PREFIX = 'nura-local-asset://';
let databasePromise;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not provide local file storage.'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = undefined; reject(request.error ?? new Error('Local file storage could not be opened.')); };
    request.onblocked = () => { databasePromise = undefined; reject(new Error('Local file storage is busy in another tab.')); };
  });
  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local file storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local file storage was interrupted.'));
  });
}

export function browserAssetUri(id) { return `${URI_PREFIX}${encodeURIComponent(id)}`; }
export function browserAssetId(uri) {
  if (!uri.startsWith(URI_PREFIX)) return null;
  try { return decodeURIComponent(uri.slice(URI_PREFIX.length)); } catch { return null; }
}

export async function saveBrowserAsset(id, blob) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).put(blob, id);
  await done;
}

export async function readBrowserAsset(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(STORE_NAME).get(id);
  const blob = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('The saved local file could not be opened.'));
  });
  await done;
  return blob;
}

export async function deleteBrowserAsset(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).delete(id);
  await done;
}

export async function clearBrowserAssets() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).clear();
  await done;
}
