async function ownedNativeKey(owner, phase, seed) {
  // Only an owned secure-loopback website executes this. No native bridge,
  // CryptoKey bytes, private database, IV or ciphertext leaves the browser.
  const report = {owner, phase, origin: location.origin, secureContext: isSecureContext,
    requestedSeed: seed, generatedKey: false, errors: []};
  let db;
  try {
    if (!isSecureContext || !crypto.subtle) throw new Error('Secure WebCrypto required');
    if (!['A', 'B'].includes(owner)) throw new Error('Owned fixture identity required');
    db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('lyco-native-key-upgrade-v1', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('identity');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const read = name => new Promise((resolve, reject) => {
      const request = db.transaction('identity').objectStore('identity').get(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (seed) {
      if (await read('key')) throw new Error('Refuse replacing an existing key');
      const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key,
        new TextEncoder().encode('LYCO original website key ' + owner));
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('identity', 'readwrite');
        const store = transaction.objectStore('identity');
        for (const [name, value] of Object.entries({key, iv, ciphertext, owner})) store.put(value, name);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Original key write aborted'));
      });
      report.generatedKey = true;
    }
    const key = await read('key');
    report.hasKey = key instanceof CryptoKey;
    if (!report.hasKey) throw new Error('Original key missing; read never generates a replacement');
    report.extractable = key.extractable;
    report.algorithm = key.algorithm;
    report.usages = [...key.usages];
    report.storedOwner = await read('owner');
    report.exportRejected = false;
    try { await crypto.subtle.exportKey('raw', key); }
    catch (error) { report.exportError = error.name; report.exportRejected = error.name === 'InvalidAccessError'; }
    const ciphertext = await read('ciphertext');
    const iv = await read('iv');
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ciphertext);
    report.originalCiphertextDecrypted = new TextDecoder().decode(plain) === 'LYCO original website key ' + owner;
    report.ciphertextSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    report.errors.push({name: error.name, message: String(error.message)});
  } finally { if (db) db.close(); }
  return report;
}
