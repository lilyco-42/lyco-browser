'use strict';
(async () => {
  const query = new URL(location.href).searchParams;
  const report = {phase: query.get('phase'), action: query.get('action'),
    origin: location.origin, secureContext: isSecureContext, generatedKey: false, errors: []};
  try {
    if (!isSecureContext || !crypto.subtle) throw new Error('Real secure-context WebCrypto required');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lyco-owned-storage', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const read = key => new Promise((resolve, reject) => {
      const request = db.transaction('values').objectStore('values').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (report.action === 'seed') {
      const value = query.get('value');
      if (!['A', 'B'].includes(value)) throw new Error('Invalid owned seed');
      const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode('LYCO owned persistent key'));
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('values', 'readwrite');
        const store = transaction.objectStore('values');
        for (const [name, item] of Object.entries({value, key, iv, ciphertext})) store.put(item, name);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('IDB write aborted'));
      });
      document.cookie = `lyco_owned=${value}; Max-Age=3600; Path=/; SameSite=Lax`;
      localStorage.setItem('lyco_owned', value);
      report.generatedKey = true;
    } else if (report.action !== 'read') throw new Error('Invalid action');
    report.cookie = document.cookie.split('; ').find(x => x.startsWith('lyco_owned='))?.split('=')[1] ?? null;
    report.localStorage = localStorage.getItem('lyco_owned');
    report.indexedDB = (await read('value')) ?? null;
    const key = await read('key');
    report.hasKey = key instanceof CryptoKey;
    report.extractable = key ? key.extractable : null;
    report.exportRejected = false;
    report.roundTripOk = false;
    report.ciphertextSha256 = null;
    if (key) {
      try { await crypto.subtle.exportKey('raw', key); }
      catch (error) { report.exportRejected = error.name === 'InvalidAccessError'; report.exportError = error.name; }
      const ciphertext = await read('ciphertext');
      const iv = await read('iv');
      const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ciphertext);
      report.roundTripOk = new TextDecoder().decode(clear) === 'LYCO owned persistent key';
      report.ciphertextSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext))]
        .map(x => x.toString(16).padStart(2, '0')).join('');
    }
    db.close();
  } catch (error) { report.errors.push({name: error.name, message: String(error.message)}); }
  const response = await fetch('/report', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(report)});
  if (!response.ok) throw new Error('Original report upload failed');
  document.title = `STORAGE COMPLETE: ${report.phase}`;
})().catch(error => { document.title = `STORAGE ERROR: ${error.name}`; });
