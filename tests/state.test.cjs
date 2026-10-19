const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { webcrypto, pbkdf2Sync, createDecipheriv } = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'inward-agi-remembrance-engine-v11.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const key = 'aru_remembrance_engine_v11_state';

function boot(saved = new Map(), storageBlocked = false, storageWriteBlocked = false) {
  const elements = new Map();
  const exports = [];
  class Element {
    constructor(id) {
      this.id = id;
      this.value = id === 'orientation' ? '42' : '';
      this.children = [];
      this.textContent = '';
      this.innerHTML = '';
      this.className = '';
    }
    getContext() { return {}; }
    appendChild(child) { this.children.push(child); child.parent = this; }
    replaceChildren() { this.children = []; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    click() { this.clicked = true; }
    addEventListener() {}
  }
  const document = {
    body: new Element('body'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    },
    createElement(tag) { return new Element(tag); }
  };
  const localStorage = {
    getItem(k) { if (storageBlocked) throw new Error('blocked'); return saved.get(k) || null; },
    setItem(k, v) { if (storageBlocked || storageWriteBlocked) throw new Error('blocked'); saved.set(k, v); },
    removeItem(k) { if (storageBlocked) throw new Error('blocked'); saved.delete(k); }
  };
  const window = {
    confirm() { return true; },
    location: { reload() { window.reloaded = true; } },
    listeners: new Map(),
    addEventListener(type, listener) { window.listeners.set(type, listener); },
    fireStorage(event) { window.listeners.get('storage')?.(event); }
  };
  const context = vm.createContext({
    document, localStorage, window, Blob, console, crypto: webcrypto,
    TextEncoder, TextDecoder, btoa, atob,
    URL: { createObjectURL(blob) { exports.push(blob); return 'blob:export'; }, revokeObjectURL() {} },
    requestAnimationFrame() {}, setTimeout(callback) { callback(); },
    performance: { now() { return 0; } }
  });
  vm.runInContext(source, context);
  return {
    saved, elements, exports, window, context,
    read(expression) { return vm.runInContext(expression, context); },
    send(text) {
      document.getElementById('input').value = text;
      vm.runInContext('sendToField()', context);
    }
  };
}

const vaultPassword = 'unique browser vault passphrase 2026';

async function enableVault(app, passphrase = vaultPassword) {
  app.context.document.getElementById('vault-passphrase').value = passphrase;
  app.context.document.getElementById('vault-confirm').value = passphrase;
  return app.read('enableVault()');
}

async function unlockVault(app, passphrase = vaultPassword) {
  app.context.document.getElementById('vault-unlock-passphrase').value = passphrase;
  return app.read('unlockVault()');
}

async function rotateVault(app, current, replacement, confirmation = replacement) {
  app.context.document.getElementById('vault-rotate-current').value = current;
  app.context.document.getElementById('vault-rotate-new').value = replacement;
  app.context.document.getElementById('vault-rotate-confirm').value = confirmation;
  return app.read('rotateVaultPassphrase()');
}

test('entries, retrieval ledger, and field snapshot survive reload', () => {
  const saved = new Map();
  const first = boot(saved);
  assert.equal(first.elements.get('mirror-status').textContent, 'NO MEMORY YET');
  first.send('A remembered detail');
  first.send('Can you revisit that remembered detail?');
  const snapshot = JSON.parse(saved.get(key));
  assert.equal(snapshot.user_history.length, 2);
  assert.equal(snapshot.ledger_entries[0].text, 'A remembered detail');
  assert.equal(snapshot.field.length, 720);
  assert.ok(snapshot.field.some(x => x !== 0.1));

  const second = boot(saved);
  assert.equal(second.read('userHistory.length'), 2);
  assert.equal(second.read('rememberRelevant("remembered detail").text'), 'A remembered detail');
  assert.equal(second.elements.get('ledger').children[0].textContent, 'A remembered detail');
  assert.equal(second.elements.get('memory-depth').textContent, 2);
  assert.ok(second.read('mu.some(x => x !== MU_BASE)'));
});

test('reviewed removal writes one fewer memory, clears its label, and resets the field', async () => {
  const app = boot(new Map([['unrelated', 'keep']]));
  app.send('Private Corvallis sunrise');
  app.send('Can you recall that Corvallis sunrise?');
  app.send('An unrelated memory from Eugene');
  app.read('updateLedger("Private Corvallis sunrise"); saveState()');
  const before = app.saved.get(key);
  assert.ok(JSON.parse(before).ledger_entries.some(entry => entry.text === 'Private Corvallis sunrise'));
  assert.equal(app.read('reviewForget(0)'), true);
  assert.equal(app.elements.get('forget-preview').textContent, 'Private Corvallis sunrise');
  assert.equal(app.saved.get(key), before);
  app.elements.get('input').value = 'Draft to keep';
  assert.equal(await app.read('commitForgottenMemory()'), true);
  assert.equal(app.window.reloaded, undefined);
  assert.equal(app.elements.get('input').value, 'Draft to keep');
  assert.equal(app.read('userHistory.length'), 2);
  assert.doesNotMatch(app.elements.get('chat').children.map(row => row.children[0].textContent).join(' '), /Private Corvallis sunrise/);
  const saved = JSON.parse(app.saved.get(key));
  assert.equal(saved.user_history.length, 2);
  assert.ok(saved.user_history.every(entry => entry.text !== 'Private Corvallis sunrise'));
  assert.ok(saved.ledger_entries.every(entry => entry.text !== 'Private Corvallis sunrise'));
  assert.ok(saved.field.every(value => value === 0.1));
  assert.equal(app.saved.get('unrelated'), 'keep');
  const reloaded = boot(app.saved);
  assert.equal(reloaded.read('userHistory.length'), 2);
  assert.equal(reloaded.read('inspectRetrieval("Private").selected'), null);
});

test('a stale removal review and failed storage write cannot discard existing memories', async () => {
  const app = boot();
  app.send('First memory');
  assert.equal(app.read('reviewForget(0)'), true);
  app.send('Second memory');
  const updated = app.saved.get(key);
  assert.equal(await app.read('commitForgottenMemory()'), false);
  assert.equal(app.saved.get(key), updated);
  assert.equal(app.elements.get('forget-review').hidden, true);

  assert.equal(app.read('reviewForget(0)'), true);
  const competing = JSON.stringify({...JSON.parse(updated), saved_at: '2000-01-01T00:00:00.000Z'});
  app.saved.set(key, competing);
  assert.equal(await app.read('commitForgottenMemory()'), false);
  assert.equal(app.saved.get(key), competing);

  const blocked = boot(new Map([[key, updated]]), false, true);
  assert.equal(blocked.read('reviewForget(0)'), true);
  assert.equal(await blocked.read('commitForgottenMemory()'), false);
  assert.equal(blocked.saved.get(key), updated);
  assert.equal(blocked.window.reloaded, undefined);
});

test('selective removal in the vault remains encrypted and cannot overwrite a changed vault', async () => {
  const app = boot();
  app.send('Vault secret to remove');
  app.send('Vault memory to retain');
  assert.equal(await enableVault(app), true);
  const before = JSON.parse(app.saved.get(key));
  assert.equal(app.read('reviewForget(0)'), true);
  assert.equal(await app.read('commitForgottenMemory()'), true);
  const after = JSON.parse(app.saved.get(key));
  assert.equal(after.format, 'aru-remembrance-vault-v1');
  assert.equal(after.salt, before.salt);
  assert.notEqual(after.iv, before.iv);
  assert.doesNotMatch(JSON.stringify(after), /Vault secret to remove/);
  const reloaded = boot(app.saved);
  assert.equal(reloaded.read('vaultLocked'), true);
  assert.equal(await unlockVault(reloaded), true);
  assert.equal(reloaded.read('userHistory.length'), 1);
  assert.equal(reloaded.read('userHistory[0].text'), 'Vault memory to retain');

  assert.equal(reloaded.read('reviewForget(0)'), true);
  const external = JSON.stringify({...after, iv: Buffer.alloc(12, 9).toString('base64')});
  app.saved.set(key, external);
  assert.equal(await reloaded.read('commitForgottenMemory()'), false);
  assert.equal(app.saved.get(key), external);
});

test('vault passphrase rotation preserves saved memory with a new salt and revokes the old browser unlock', async () => {
  const app = boot();
  app.send('Private memory that survives rotation');
  assert.equal(await enableVault(app), true);
  const before = JSON.parse(app.saved.get(key));
  const replacement = 'a completely different browser vault passphrase 2026';
  assert.equal(await rotateVault(app, vaultPassword, replacement), true);
  const after = JSON.parse(app.saved.get(key));
  assert.equal(after.format, 'aru-remembrance-vault-v1');
  assert.notEqual(after.salt, before.salt);
  assert.notEqual(after.iv, before.iv);
  assert.notEqual(after.ciphertext, before.ciphertext);
  assert.doesNotMatch(app.saved.get(key), /Private memory that survives rotation/);
  assert.equal(app.elements.get('vault-rotate-current').value, '');
  assert.equal(app.elements.get('vault-rotate-new').value, '');
  assert.equal(app.elements.get('vault-rotate-confirm').value, '');

  const sealed = Buffer.from(after.ciphertext, 'base64');
  const keyBytes = pbkdf2Sync(replacement, Buffer.from(after.salt, 'base64'), after.iterations, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes, Buffer.from(after.iv, 'base64'));
  decipher.setAAD(Buffer.from(after.format));
  decipher.setAuthTag(sealed.subarray(-16));
  const state = JSON.parse(Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]).toString());
  assert.equal(state.user_history[0].text, 'Private memory that survives rotation');

  const reloaded = boot(app.saved);
  assert.equal(await unlockVault(reloaded), false);
  assert.equal(reloaded.read('vaultLocked'), true);
  assert.equal(await unlockVault(reloaded, replacement), true);
  assert.equal(reloaded.read('userHistory[0].text'), 'Private memory that survives rotation');
});

test('wrong current passphrase, invalid new choice, and failed write preserve the old vault', async () => {
  const app = boot();
  app.send('Keep protected memory');
  assert.equal(await enableVault(app), true);
  const before = app.saved.get(key);
  const replacement = 'a newly chosen long vault phrase';
  assert.equal(await rotateVault(app, 'wrong current passphrase', replacement), false);
  assert.match(app.elements.get('vault-status').textContent, /Current passphrase is incorrect/);
  assert.equal(app.saved.get(key), before);
  assert.equal(await rotateVault(app, vaultPassword, replacement, 'different confirmation'), false);
  assert.equal(await rotateVault(app, vaultPassword, vaultPassword.normalize('NFD')), false);
  assert.equal(await rotateVault(app, vaultPassword, 'too short'), false);
  assert.equal(app.saved.get(key), before);

  const blocked = boot(app.saved, false, true);
  assert.equal(await unlockVault(blocked), true);
  assert.equal(await rotateVault(blocked, vaultPassword, replacement), false);
  assert.equal(app.saved.get(key), before);
  assert.equal(blocked.read('vaultSession') !== null, true);
  assert.equal(await blocked.read('lockVault()'), true);
  assert.equal(await unlockVault(boot(app.saved)), true);
});

test('a cross-tab vault change during passphrase rotation is never overwritten', async () => {
  const app = boot();
  app.send('Do not lose this vault');
  assert.equal(await enableVault(app), true);
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  app.context.rotationSealStarted = entered;
  app.read(`const originalSealForRotation = sealVaultState;
    sealVaultState = async (...args) => {
      rotationSealStarted();
      await new Promise(resolve => { globalThis.continueRotationSeal = resolve; });
      return originalSealForRotation(...args);
    };`);
  const rotating = rotateVault(app, vaultPassword, 'a brand new protected phrase for rotation');
  await started;
  const competing = JSON.stringify({...JSON.parse(app.saved.get(key)), iv: Buffer.alloc(12, 8).toString('base64')});
  app.saved.set(key, competing);
  app.window.fireStorage({key, newValue: competing});
  app.context.continueRotationSeal();
  assert.equal(await rotating, false);
  assert.equal(app.saved.get(key), competing);
  assert.equal(app.read('vaultLocked'), true);
});

test('full memory refuses a 41st input without changing the draft, field, chat, or saved state', async () => {
  const app = boot();
  for (let index = 0; index < 35; index++) app.send(`Memory ${index} unique`);
  assert.match(app.elements.get('capacity-status').textContent, /5 spaces remain/);
  for (let index = 35; index < 40; index++) app.send(`Memory ${index} unique`);
  const before = app.saved.get(key);
  const field = JSON.stringify(app.read('Array.from(mu)'));
  const chatCount = app.elements.get('chat').children.length;
  app.elements.get('input').value = 'The waiting forty-first entry';
  assert.equal(app.read('sendToField()'), false);
  assert.equal(app.elements.get('input').value, 'The waiting forty-first entry');
  assert.match(app.elements.get('send-status').textContent, /Entry not saved/);
  assert.match(app.elements.get('capacity-status').textContent, /40 of 40/);
  assert.equal(app.read('userHistory.length'), 40);
  assert.equal(app.elements.get('chat').children.length, chatCount);
  assert.equal(JSON.stringify(app.read('Array.from(mu)')), field);
  assert.equal(app.saved.get(key), before);

  assert.equal(app.read('reviewForget(0)'), true);
  assert.equal(await app.read('commitForgottenMemory()'), true);
  assert.equal(app.elements.get('input').value, 'The waiting forty-first entry');
  assert.equal(app.read('userHistory.length'), 39);
  app.read('sendToField()');
  assert.equal(app.read('userHistory.length'), 40);
  assert.equal(app.read('userHistory[39].text'), 'The waiting forty-first entry');
  assert.equal(app.read('userHistory.some(entry => entry.text === "Memory 0 unique")'), false);
});

test('the full encrypted vault also refuses new input without overwriting its ciphertext', async () => {
  const app = boot();
  for (let index = 0; index < 40; index++) app.send(`Protected memory ${index}`);
  assert.equal(await enableVault(app), true);
  const before = app.saved.get(key);
  app.elements.get('input').value = 'Vault draft at capacity';
  assert.equal(app.read('sendToField()'), false);
  assert.equal(app.elements.get('input').value, 'Vault draft at capacity');
  assert.equal(app.saved.get(key), before);
  assert.equal(app.read('vaultPendingWrites'), 0);
  assert.equal(app.read('reviewForget(0)'), true);
  assert.equal(await app.read('commitForgottenMemory()'), true);
  assert.equal(app.elements.get('input').value, 'Vault draft at capacity');
  app.read('sendToField()');
  await app.read('vaultWriteQueue');
  const locked = boot(app.saved);
  assert.equal(await unlockVault(locked), true);
  assert.equal(locked.read('userHistory.length'), 40);
  assert.equal(locked.read('userHistory[39].text'), 'Vault draft at capacity');
});

test('a cross-tab change during selective vault removal wins over the delayed encryption', async () => {
  const app = boot();
  app.send('Protected entry');
  assert.equal(await enableVault(app), true);
  assert.equal(app.read('reviewForget(0)'), true);
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  app.context.sealStarted = entered;
  app.read(`const originalSealForRemoval = sealVaultState;
    sealVaultState = async (...args) => {
      sealStarted();
      await new Promise(resolve => { globalThis.continueRemovalSeal = resolve; });
      return originalSealForRemoval(...args);
    };`);
  const removing = app.read('commitForgottenMemory()');
  await started;
  const competing = JSON.stringify({...JSON.parse(app.saved.get(key)), iv: Buffer.alloc(12, 7).toString('base64')});
  app.saved.set(key, competing);
  app.window.fireStorage({key, newValue: competing});
  app.context.continueRemovalSeal();
  assert.equal(await removing, false);
  assert.equal(app.saved.get(key), competing);
  assert.equal(app.read('vaultLocked'), true);
});

test('response gate uses the field score after the submitted perturbation', () => {
  const app = boot();
  app.read('calculateCoherence = () => 0.1');
  app.send('expand this field');
  const messages = app.elements.get('chat').children.map(row => row.children[0].textContent);
  assert.ok(messages.some(message => message.includes('Guardian Veto™ engaged')));
});

test('damaged snapshots are ignored and blocked storage does not stop interaction', () => {
  const damaged = boot(new Map([[key, '{broken']]));
  assert.equal(damaged.read('userHistory.length'), 0);
  damaged.send('Works despite corrupt saved JSON');
  assert.equal(damaged.read('userHistory.length'), 1);

  const blocked = boot(new Map(), true);
  blocked.send('Ephemeral text');
  assert.equal(blocked.read('userHistory.length'), 1);
  assert.match(blocked.elements.get('storage-status').textContent, /unavailable/);
});

test('export includes text and erasure removes only the app state', async () => {
  const app = boot(new Map([['unrelated', 'keep']]));
  app.send('Private phrase');
  app.read('exportState()');
  const data = JSON.parse(await app.exports[0].text());
  assert.equal(data.user_history[0].text, 'Private phrase');
  assert.equal(data.schema_version, 1);
  app.read('eraseState()');
  assert.equal(app.window.reloaded, true);
  assert.equal(app.saved.get('unrelated'), 'keep');
  assert.equal(app.saved.has(key), false);
});

test('encrypted export is private, randomized, independently decryptable, and reviewed before restore', async () => {
  const donor = boot();
  donor.send('A private café memory');
  const passphrase = 'a long unique café passphrase 🗝️';
  const password = donor.context.document.getElementById('export-passphrase');
  const confirm = donor.context.document.getElementById('export-confirm');
  password.value = passphrase;
  confirm.value = passphrase;
  await donor.read('exportEncryptedState()');
  assert.equal(password.value, '');
  assert.equal(confirm.value, '');
  assert.equal(donor.exports.length, 1);
  const raw = await donor.exports[0].text();
  assert.doesNotMatch(raw, /private café memory/);
  const envelope = JSON.parse(raw);
  assert.deepEqual(Object.keys(envelope).sort(), ['ciphertext', 'format', 'iterations', 'iv', 'salt']);
  assert.equal(envelope.format, 'aru-remembrance-encrypted-v1');
  assert.equal(envelope.iterations, 600000);

  // Use Node's independent PBKDF2/AES-GCM implementation, not the app's decryptor.
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const sealed = Buffer.from(envelope.ciphertext, 'base64');
  const keyBytes = pbkdf2Sync(passphrase.normalize('NFC'), salt, envelope.iterations, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes, iv);
  decipher.setAAD(Buffer.from(envelope.format));
  decipher.setAuthTag(sealed.subarray(-16));
  const decoded = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  assert.equal(JSON.parse(decoded.toString()).user_history[0].text, 'A private café memory');

  password.value = passphrase;
  confirm.value = passphrase;
  await donor.read('exportEncryptedState()');
  const second = JSON.parse(await donor.exports[1].text());
  assert.notEqual(second.salt, envelope.salt);
  assert.notEqual(second.iv, envelope.iv);
  assert.notEqual(second.ciphertext, envelope.ciphertext);

  const saved = new Map();
  const receiver = boot(saved);
  receiver.send('Keep until approved');
  const before = saved.get(key);
  receiver.context.document.getElementById('state-file').files = [{
    name: 'encrypted.json', size: new Blob([raw]).size, text: async () => raw
  }];
  receiver.context.document.getElementById('import-passphrase').value = passphrase.normalize('NFD');
  await receiver.read('reviewImportFile()');
  assert.equal(receiver.elements.get('import-passphrase').value, '');
  assert.equal(saved.get(key), before);
  assert.match(receiver.elements.get('import-summary').textContent, /1 incoming memories/);
  assert.equal(receiver.read('applyReviewedImport()'), true);
  assert.equal(boot(saved).read('userHistory[0].text'), 'A private café memory');
});

test('wrong passphrase, tampering, and malformed encrypted files never replace state', async () => {
  const donor = boot();
  donor.send('Do not reveal this memory');
  donor.context.document.getElementById('export-passphrase').value = 'a sufficiently long password';
  donor.context.document.getElementById('export-confirm').value = 'a sufficiently long password';
  await donor.read('exportEncryptedState()');
  const original = JSON.parse(await donor.exports[0].text());

  const app = boot();
  app.send('Keep existing memory');
  const before = app.saved.get(key);
  const file = app.context.document.getElementById('state-file');
  const importPassword = app.context.document.getElementById('import-passphrase');
  async function attempt(data, passphrase) {
    const raw = JSON.stringify(data);
    file.files = [{name: 'encrypted.json', size: new Blob([raw]).size, text: async () => raw}];
    importPassword.value = passphrase;
    await app.read('reviewImportFile()');
    assert.equal(importPassword.value, '');
    assert.equal(app.read('pendingImport'), null);
    assert.equal(app.read('applyReviewedImport()'), false);
    assert.equal(app.saved.get(key), before);
    assert.equal(app.elements.get('import-review').hidden, true);
  }
  await attempt(original, 'wrong but sufficiently long');
  assert.match(app.elements.get('import-status').textContent, /Wrong passphrase or damaged/);
  const bytes = Buffer.from(original.ciphertext, 'base64');
  bytes[0] ^= 1;
  await attempt({...original, ciphertext: bytes.toString('base64')}, 'a sufficiently long password');
  assert.match(app.elements.get('import-status').textContent, /Wrong passphrase or damaged/);
  await attempt({...original, iterations: 1}, 'a sufficiently long password');
  assert.match(app.elements.get('import-status').textContent, /format is invalid/);
  await attempt({...original, salt: '@invalid'}, 'a sufficiently long password');
  assert.match(app.elements.get('import-status').textContent, /format is invalid/);

  file.files = [{name: 'oversize.json', size: 512 * 1024 + 1}];
  importPassword.value = 'a sufficiently long password';
  await app.read('reviewImportFile()');
  assert.equal(importPassword.value, '');
  assert.equal(app.saved.get(key), before);
});

test('an interaction during encrypted decoding invalidates the pending review', async () => {
  const app = boot();
  const raw = JSON.stringify(app.read('stateSnapshot()'));
  app.context.document.getElementById('state-file').files = [{name: 'delayed.json', size: 100, text: async () => raw}];
  let signalDecode;
  const decoding = new Promise(resolve => { signalDecode = resolve; });
  app.context.signalDecode = signalDecode;
  app.read('decodeImportText = () => { signalDecode(); return new Promise(resolve => { globalThis.finishDecode = resolve; }); }');
  const reviewing = app.read('reviewImportFile()');
  await decoding;
  app.send('Newer local memory');
  const before = app.saved.get(key);
  app.context.finishDecode(raw);
  await reviewing;
  assert.equal(app.read('pendingImport'), null);
  assert.equal(app.saved.get(key), before);
});

test('the deliverable has self-contained styles and no remote runtime asset', () => {
  assert.match(html, /<style id="tailwind-generated">[\s\S]*?\.rounded-xl/);
  assert.match(html, /Content-Security-Policy[^>]*connect-src 'none'[^>]*object-src 'none'/);
  const withoutGeneratedStyle = html.replace(/<style id="tailwind-generated">[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(withoutGeneratedStyle, /<script\s+src=|<link\s+[^>]*href=|@import|url\(https?:|<iframe\b/);
});

test('missing Web Crypto refuses encrypted download without a plaintext fallback', async () => {
  const app = boot();
  app.send('Private text');
  app.context.crypto = undefined;
  app.context.document.getElementById('export-passphrase').value = 'a sufficiently long password';
  app.context.document.getElementById('export-confirm').value = 'a sufficiently long password';
  await app.read('exportEncryptedState()');
  assert.equal(app.exports.length, 0);
  assert.match(app.elements.get('crypto-status').textContent, /secure browser context/);
  assert.equal(app.elements.get('export-passphrase').value, '');
});

test('opt-in vault migrates an existing memory, seals later saves, and unlocks after reload', async () => {
  const saved = new Map();
  const app = boot(saved);
  app.send('Private vault memory one');
  const previous = saved.get(key);
  assert.match(previous, /Private vault memory one/);
  assert.equal(await enableVault(app), true);
  assert.equal(app.elements.get('vault-passphrase').value, '');
  assert.equal(app.elements.get('vault-confirm').value, '');
  assert.equal(app.elements.get('vault-setup').hidden, true);
  const first = JSON.parse(saved.get(key));
  assert.equal(first.format, 'aru-remembrance-vault-v1');
  assert.doesNotMatch(saved.get(key), /Private vault memory one/);

  app.send('Private vault memory two');
  await app.read('vaultWriteQueue');
  const second = JSON.parse(saved.get(key));
  assert.notEqual(second.iv, first.iv);
  assert.equal(second.salt, first.salt);
  assert.doesNotMatch(saved.get(key), /Private vault memory/);

  const independentKey = pbkdf2Sync(vaultPassword, Buffer.from(second.salt, 'base64'), second.iterations, 32, 'sha256');
  const sealed = Buffer.from(second.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', independentKey, Buffer.from(second.iv, 'base64'));
  decipher.setAAD(Buffer.from(second.format));
  decipher.setAuthTag(sealed.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  assert.deepEqual(JSON.parse(plaintext.toString()).user_history.map(e => e.text),
    ['Private vault memory one', 'Private vault memory two']);

  app.context.document.getElementById('retrieval-audit').textContent = 'Private vault memory one';
  app.context.document.getElementById('import-summary').textContent = 'Private vault memory two';
  assert.equal(await app.read('lockVault()'), true);
  assert.equal(app.read('vaultLocked'), true);
  assert.equal(app.read('userHistory.length'), 0);
  assert.doesNotMatch(app.elements.get('retrieval-audit').textContent, /Private vault memory/);
  assert.equal(app.elements.get('import-summary').textContent, '');
  app.read('exportState()');
  assert.equal(app.exports.length, 0);

  const reloaded = boot(saved);
  assert.equal(reloaded.read('vaultLocked'), true);
  assert.equal(reloaded.read('userHistory.length'), 0);
  assert.equal(reloaded.elements.get('vault-lock').hidden, false);
  reloaded.send('Ignored while locked');
  assert.equal(saved.get(key), JSON.stringify(second));
  assert.equal(await unlockVault(reloaded, 'wrong but sufficiently long'), false);
  assert.equal(reloaded.read('userHistory.length'), 0);
  assert.equal(reloaded.elements.get('vault-unlock-passphrase').value, '');
  assert.equal(await unlockVault(reloaded), true);
  assert.equal(reloaded.read('vaultLocked'), false);
  assert.equal(reloaded.read('userHistory.length'), 2);
  assert.equal(reloaded.read('userHistory[1].text'), 'Private vault memory two');
});

test('vault restore and selective merge retain encryption and reject stale selections', async () => {
  const donor = boot();
  donor.send('Incoming protected merge');
  const incoming = JSON.stringify(donor.read('stateSnapshot()'));
  const saved = new Map();
  const app = boot(saved);
  app.send('Current protected merge');
  assert.equal(await enableVault(app), true);
  assert.equal(app.read(`reviewImportText(${JSON.stringify(incoming)})`), true);
  const before = saved.get(key);
  assert.equal(await app.read("applyReviewedImport('merge')"), true);
  assert.equal(app.window.reloaded, true);
  assert.notEqual(saved.get(key), before);
  assert.doesNotMatch(saved.get(key), /Current protected merge|Incoming protected merge/);
  const restored = boot(saved);
  assert.equal(restored.read('vaultLocked'), true);
  assert.equal(await unlockVault(restored), true);
  assert.equal(restored.read('userHistory.length'), 2);

  const replacement = JSON.stringify(donor.read('stateSnapshot()'));
  assert.equal(restored.read(`reviewImportText(${JSON.stringify(replacement)})`), true);
  restored.send('Newer protected interaction');
  await restored.read('vaultWriteQueue');
  const after = saved.get(key);
  assert.equal(await restored.read('applyReviewedImport()'), false);
  assert.equal(saved.get(key), after);
  assert.doesNotMatch(after, /Newer protected interaction/);
});

test('an encrypted portable file restores into a separately encrypted browser vault', async () => {
  const donor = boot();
  donor.send('Sealed transfer across browsers');
  donor.context.document.getElementById('export-passphrase').value = 'portable copy passphrase 2026';
  donor.context.document.getElementById('export-confirm').value = 'portable copy passphrase 2026';
  await donor.read('exportEncryptedState()');
  const raw = await donor.exports[0].text();

  const receiver = boot();
  assert.equal(await enableVault(receiver), true);
  receiver.context.document.getElementById('state-file').files = [{
    name: 'portable.json', size: new Blob([raw]).size, text: async () => raw
  }];
  receiver.context.document.getElementById('import-passphrase').value = 'portable copy passphrase 2026';
  await receiver.read('reviewImportFile()');
  assert.equal(receiver.read('pendingImport !== null'), true);
  assert.equal(await receiver.read('applyReviewedImport()'), true);
  assert.doesNotMatch(receiver.saved.get(key), /Sealed transfer across browsers/);
  const opened = boot(receiver.saved);
  assert.equal(await unlockVault(opened), true);
  assert.equal(opened.read('userHistory[0].text'), 'Sealed transfer across browsers');
});

test('vault rejects tampering, unknown formats, and cross-tab changes without plaintext fallback', async () => {
  const saved = new Map();
  const app = boot(saved);
  app.send('Never silently replace this');
  assert.equal(await enableVault(app), true);
  const original = saved.get(key);
  const envelope = JSON.parse(original);
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  const tampered = JSON.stringify({...envelope, ciphertext: bytes.toString('base64')});
  const damaged = boot(new Map([[key, tampered]]));
  assert.equal(damaged.read('vaultLocked'), true);
  assert.equal(await unlockVault(damaged), false);
  damaged.send('Cannot overwrite while locked');
  assert.equal(damaged.saved.get(key), tampered);

  const unknown = JSON.stringify({...envelope, format: 'aru-remembrance-vault-v2'});
  const future = boot(new Map([[key, unknown]]));
  assert.equal(future.read('vaultLocked'), true);
  assert.equal(await unlockVault(future), false);
  future.send('Cannot downgrade');
  assert.equal(future.saved.get(key), unknown);

  saved.set(key, JSON.stringify({...envelope, iv: bytes.toString('base64').slice(0, 16)}));
  app.window.fireStorage({key, newValue: saved.get(key)});
  assert.equal(app.read('vaultLocked'), true);
  assert.equal(app.read('userHistory.length'), 0);
  assert.notEqual(saved.get(key), original);
});

test('vault write failure and unreadable old state preserve the stored bytes', async () => {
  const seed = boot();
  seed.send('Persisted protected entry');
  assert.equal(await enableVault(seed), true);
  const sealed = seed.saved.get(key);
  const blocked = boot(seed.saved, false, true);
  assert.equal(await unlockVault(blocked), true);
  blocked.send('Unsaved protected entry');
  await blocked.read('vaultWriteQueue');
  assert.equal(seed.saved.get(key), sealed);
  assert.equal(blocked.read('storageConflict'), true);
  assert.equal(await blocked.read('lockVault()'), false);
  assert.match(blocked.elements.get('vault-status').textContent, /A save failed/);

  const corrupted = '{damaged';
  const old = boot(new Map([[key, corrupted]]));
  old.send('Still usable in memory');
  assert.equal(old.read('userHistory.length'), 1);
  assert.equal(old.saved.get(key), corrupted);
  assert.equal(await enableVault(old), false);
  assert.equal(old.saved.get(key), corrupted);
});

test('vault migration failure keeps the original plaintext, and locking waits for a save', async () => {
  const plain = boot();
  plain.send('Original unsealed memory');
  const original = plain.saved.get(key);
  const blocked = boot(plain.saved, false, true);
  assert.equal(await enableVault(blocked), false);
  assert.equal(plain.saved.get(key), original);
  assert.equal(blocked.read('vaultSession'), null);

  const saved = new Map();
  const app = boot(saved);
  assert.equal(await enableVault(app), true);
  app.send('Save while locking');
  const unload = {preventDefault() { unload.prevented = true; }};
  app.window.listeners.get('beforeunload')(unload);
  assert.equal(unload.prevented, true);
  assert.equal(await app.read('lockVault()'), true);
  assert.doesNotMatch(saved.get(key), /Save while locking/);
  const reloaded = boot(saved);
  assert.equal(await unlockVault(reloaded), true);
  assert.equal(reloaded.read('userHistory[0].text'), 'Save while locking');
});

test('vault import aborts if an interaction changes state while restore starts', async () => {
  const donor = boot();
  donor.send('Donor memory');
  const raw = JSON.stringify(donor.read('stateSnapshot()'));
  const app = boot();
  assert.equal(await enableVault(app), true);
  assert.equal(app.read(`reviewImportText(${JSON.stringify(raw)})`), true);
  const applying = app.read('applyReviewedImport()');
  app.send('Newer local memory');
  assert.equal(await applying, false);
  await app.read('vaultWriteQueue');
  assert.doesNotMatch(app.saved.get(key), /Donor memory|Newer local memory/);
  const reloaded = boot(app.saved);
  assert.equal(await unlockVault(reloaded), true);
  assert.equal(reloaded.read('userHistory[0].text'), 'Newer local memory');
});

test('an unseen cross-tab write during encryption cannot be overwritten', async () => {
  const saved = new Map();
  const app = boot(saved);
  assert.equal(await enableVault(app), true);
  app.send('Write awaiting encryption');
  const otherTabValue = JSON.stringify({...JSON.parse(saved.get(key)), iv: 'AAAAAAAAAAAAAAAA'});
  saved.set(key, otherTabValue);
  await app.read('vaultWriteQueue');
  assert.equal(saved.get(key), otherTabValue);
  assert.equal(app.read('vaultLocked'), true);
  assert.equal(app.read('userHistory.length'), 0);
});

test('a forgotten vault can be erased from the locked screen without touching other keys', async () => {
  const saved = new Map([['unrelated', 'keep']]);
  const app = boot(saved);
  app.send('Entry whose passphrase is lost');
  assert.equal(await enableVault(app), true);
  const locked = boot(saved);
  assert.equal(locked.read('vaultLocked'), true);
  locked.read('eraseState()');
  assert.equal(locked.window.reloaded, true);
  assert.equal(saved.has(key), false);
  assert.equal(saved.get('unrelated'), 'keep');
  assert.equal(boot(saved).read('vaultLocked'), false);
});

test('an already open plaintext tab cannot downgrade a newly enabled vault', async () => {
  const saved = new Map();
  const first = boot(saved);
  first.send('Original protected value');
  const olderTab = boot(saved);
  assert.equal(await enableVault(first), true);
  const sealed = saved.get(key);
  olderTab.send('Another tab tries to save plaintext');
  assert.equal(saved.get(key), sealed);
  assert.equal(olderTab.read('storageConflict'), true);
  assert.doesNotMatch(saved.get(key), /Original protected value|Another tab tries/);
});

test('reviewed transfer restores the exact exported memory and field after explicit acceptance', async () => {
  const donor = boot();
  donor.send('Corvallis sunrise');
  donor.send('Do you remember Corvallis sunrise?');
  donor.read('exportState()');
  const raw = await donor.exports[0].text();
  const original = JSON.parse(raw);
  const saved = new Map([['unrelated', 'keep']]);
  const receiver = boot(saved);
  receiver.send('A different local memory');
  const before = saved.get(key);
  receiver.context.document.getElementById('state-file').files = [{
    name: 'transfer.json', size: new Blob([raw]).size, text: async () => raw
  }];
  await receiver.read('reviewImportFile()');
  assert.equal(receiver.read('pendingImport !== null'), true);
  assert.equal(saved.get(key), before);
  assert.equal(receiver.read('userHistory.length'), 1);
  assert.match(receiver.elements.get('import-summary').textContent, /2 incoming memories/);
  assert.equal(receiver.elements.get('import-entries').children.length, 2);
  assert.equal(receiver.elements.get('import-entries').children[0].textContent, 'Corvallis sunrise');
  assert.equal(receiver.elements.get('import-review').hidden, false);
  assert.equal(receiver.read('applyReviewedImport()'), true);
  assert.equal(receiver.window.reloaded, true);
  assert.equal(saved.get('unrelated'), 'keep');
  const restored = boot(saved);
  assert.equal(restored.read('userHistory.length'), 2);
  assert.equal(restored.read('userHistory[0].text'), 'Corvallis sunrise');
  assert.deepEqual(JSON.parse(saved.get(key)).user_history, original.user_history);
  assert.deepEqual(JSON.parse(saved.get(key)).ledger_entries, original.ledger_entries);
  assert.deepEqual(JSON.parse(saved.get(key)).field, original.field);
});

test('invalid and hostile exports cannot replace local state or inject HTML', () => {
  const app = boot();
  app.send('Keep this memory');
  const before = app.saved.get(key);
  const valid = JSON.parse(JSON.stringify(app.read('stateSnapshot()')));
  const cases = [
    '{broken',
    JSON.stringify({...valid, schema_version: 2}),
    JSON.stringify({...valid, field: valid.field.slice(1)}),
    JSON.stringify({...valid, field: [3, ...valid.field.slice(1)]}),
    JSON.stringify({...valid, ledger_entries: [{text: 'x'.repeat(30), ts: 1}]}),
    JSON.stringify({...valid, user_history: [{text: 'x'.repeat(2001), ts: 1}]}),
    JSON.stringify({...valid, user_history: Array(41).fill({text: 'x', ts: 1})}),
    JSON.stringify({...valid, field: undefined}),
    ' '.repeat(256 * 1024 + 1)
  ];
  for (const raw of cases) {
    assert.equal(app.read(`reviewImportText(${JSON.stringify(raw)})`), false);
    assert.equal(app.read('applyReviewedImport()'), false);
    assert.equal(app.saved.get(key), before);
    assert.equal(app.elements.get('import-review').hidden, true);
  }
  const hostile = {...valid, user_history: [{text: '<img src=x onerror=alert(1)>', ts: 1}]};
  assert.equal(app.read(`reviewImportText(${JSON.stringify(JSON.stringify(hostile))})`), true);
  assert.equal(app.elements.get('import-entries').children[0].textContent, hostile.user_history[0].text);
  assert.equal(app.elements.get('import-entries').children[0].innerHTML, '');
  assert.equal(app.saved.get(key), before);
});

test('a later interaction, different file, or another tab makes the review stale', async () => {
  const app = boot();
  app.send('Existing');
  const raw = JSON.stringify(app.read('stateSnapshot()'));
  assert.equal(app.read(`reviewImportText(${JSON.stringify(raw)})`), true);
  app.send('New interaction');
  const changed = app.saved.get(key);
  assert.equal(app.read('applyReviewedImport()'), false);
  assert.equal(app.saved.get(key), changed);

  assert.equal(app.read(`reviewImportText(${JSON.stringify(raw)})`), true);
  app.saved.set(key, JSON.stringify({...JSON.parse(changed), saved_at: '2026-01-01T00:00:00.000Z'}));
  const otherTab = app.saved.get(key);
  assert.equal(app.read('applyReviewedImport()'), false);
  assert.equal(app.saved.get(key), otherTab);
  assert.match(app.elements.get('import-status').textContent, /another tab/);

  const file = {name: 'old.json', size: 100, text: () => new Promise(resolve => { file.resolve = resolve; })};
  app.context.document.getElementById('state-file').files = [file];
  const reading = app.read('reviewImportFile()');
  app.elements.get('state-file').files = [{name: 'new.json'}];
  app.read("cancelImportReview('Selection changed.')");
  file.resolve(raw);
  await reading;
  assert.equal(app.read('pendingImport'), null);
  assert.equal(app.saved.get(key), otherTab);
});

test('failed storage write leaves the existing memory untouched', () => {
  const seed = boot();
  seed.send('Donor memory');
  const raw = JSON.stringify(seed.read('stateSnapshot()'));
  const saved = new Map([['unrelated', 'keep']]);
  const app = boot(saved, false, true);
  assert.equal(app.read(`reviewImportText(${JSON.stringify(raw)})`), true);
  assert.equal(app.read('applyReviewedImport()'), false);
  assert.equal(app.window.reloaded, undefined);
  assert.equal(app.read('userHistory.length'), 0);
  assert.equal(saved.has(key), false);
  assert.equal(saved.get('unrelated'), 'keep');
});

test('merge deduplicates exact events, preserves distinct repeats and current field, and restores selected history', () => {
  const app = boot();
  app.send('Shared memory');
  app.send('Current-only memory');
  const current = JSON.parse(app.saved.get(key));
  const incoming = {
    ...current,
    user_history: [current.user_history[0], {text: 'Shared memory', ts: current.user_history[0].ts + 1000},
      {text: 'Imported-only memory', ts: current.user_history[0].ts + 2000}],
    ledger_entries: [{text: 'Imported label', ts: 1}],
    field: Array(720).fill(1.5)
  };
  const before = app.saved.get(key);
  assert.equal(app.read(`reviewImportText(${JSON.stringify(JSON.stringify(incoming))})`), true);
  assert.equal(app.saved.get(key), before);
  assert.equal(app.read('pendingImport.candidates.length'), 4);
  assert.match(app.elements.get('merge-count').textContent, /4 selected of 4 distinct/);
  assert.equal(app.elements.get('merge-entries').children[0].children[0].children[1].textContent.includes('current + incoming'), true);
  assert.equal(app.read("applyReviewedImport('merge')"), true);
  assert.equal(app.window.reloaded, true);
  const merged = JSON.parse(app.saved.get(key));
  assert.equal(merged.user_history.length, 4);
  assert.equal(merged.user_history.filter(e => e.text === 'Shared memory').length, 2);
  assert.deepEqual(merged.user_history.map(e => e.ts), [...merged.user_history.map(e => e.ts)].sort((a, b) => a - b));
  assert.deepEqual(merged.field, current.field);
  assert.deepEqual(merged.ledger_entries, current.ledger_entries);
  const restored = boot(app.saved);
  assert.equal(restored.read('userHistory.length'), 4);
});

test('a merge over 40 remains blocked until the user chooses every included memory', () => {
  const app = boot();
  app.read('userHistory = Array.from({length: 30}, (_, i) => ({text: `Current ${i}`, ts: 1000 + i, tokens: []})); saveState()');
  const before = app.saved.get(key);
  const incoming = JSON.parse(before);
  incoming.user_history = Array.from({length: 30}, (_, i) => ({text: `Incoming ${i}`, ts: 2000 + i}));
  assert.equal(app.read(`reviewImportText(${JSON.stringify(JSON.stringify(incoming))})`), true);
  assert.match(app.elements.get('merge-count').textContent, /60 selected of 60 distinct memories; 0 excluded/);
  assert.equal(app.elements.get('merge-commit').disabled, true);
  assert.equal(app.read("applyReviewedImport('merge')"), false);
  assert.equal(app.saved.get(key), before);

  app.read("selectMergeSource('incoming')");
  assert.match(app.elements.get('merge-count').textContent, /30 selected of 60 distinct memories; 30 excluded/);
  for (let i = 0; i < 10; i++) app.elements.get('merge-entries').children[i].children[0].children[0].checked = true;
  app.read('updateMergeSelection()');
  assert.match(app.elements.get('merge-count').textContent, /40 selected of 60 distinct memories; 20 excluded/);
  assert.equal(app.elements.get('merge-commit').disabled, false);
  assert.equal(app.saved.get(key), before);
  assert.equal(app.read("applyReviewedImport('merge')"), true);
  const selected = JSON.parse(app.saved.get(key)).user_history.map(e => e.text);
  assert.deepEqual(selected, [
    ...Array.from({length: 10}, (_, i) => `Current ${i}`),
    ...Array.from({length: 30}, (_, i) => `Incoming ${i}`)
  ]);
  assert.equal(boot(app.saved).read('userHistory.length'), 40);
});

test('merge rechecks storage after selection and refuses a stale review', () => {
  const app = boot();
  app.send('Current memory');
  const incoming = JSON.parse(app.saved.get(key));
  incoming.user_history = [{text: 'Incoming memory', ts: 1}];
  assert.equal(app.read(`reviewImportText(${JSON.stringify(JSON.stringify(incoming))})`), true);
  app.read("selectMergeSource('incoming')");
  const changed = {...JSON.parse(app.saved.get(key)), saved_at: '2026-01-01T00:00:00.000Z'};
  app.saved.set(key, JSON.stringify(changed));
  assert.equal(app.read("applyReviewedImport('merge')"), false);
  assert.deepEqual(JSON.parse(app.saved.get(key)), changed);
  assert.equal(app.elements.get('import-review').hidden, true);
});

test('unrelated input never quotes an earlier private entry', () => {
  const app = boot();
  app.send('My private Portland account is blue');
  assert.equal(app.read('rememberRelevant("astronomy")'), null);
  app.send('Tell me about astronomy');
  const messages = app.elements.get('chat').children.map(row => row.children[0].textContent);
  assert.doesNotMatch(messages.at(-1), /private Portland account/);
  assert.match(app.elements.get('retrieval-audit').textContent, /No recall: no shared substantive words/);
  assert.equal(app.read('userHistory.length'), 2);
});

test('inspection selects a supported memory without mutating the field or saving the query', () => {
  const app = boot();
  app.send('Portland rain in October');
  app.send('A Seattle winter');
  const beforeField = app.read('Array.from(mu)');
  const beforeState = app.saved.get(key);
  app.context.document.getElementById('retrieval-query').value = 'What about Portland rain?';
  app.read('inspectQuery()');
  assert.match(app.elements.get('retrieval-audit').textContent, /Portland rain in October/);
  assert.match(app.elements.get('retrieval-audit').textContent, /Matched words: portland, rain/);
  assert.equal(app.saved.get(key), beforeState);
  assert.deepEqual(Array.from(app.read('Array.from(mu)')), Array.from(beforeField));
  assert.equal(app.read('userHistory.length'), 2);
  const audit = app.read('inspectRetrieval("Portland Portland rain")');
  assert.equal(audit.status, 'supported');
  assert.equal(audit.matches.length, 2); // repeated query words cannot inflate a score
});

test('equal evidence for different memories abstains; a specific query resolves it', () => {
  const app = boot();
  app.read('userHistory = ["Portland rain", "Portland sunshine"].map(text => ({text, tokens: tokenize(text), ts: 1}))');
  const ambiguous = app.read('inspectRetrieval("What about Portland?")');
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.ambiguityCount, 2);
  assert.equal(app.read('rememberRelevant("Portland")'), null);
  assert.equal(app.read('inspectRetrieval("Portland rain").selected.index'), 0);
  app.context.document.getElementById('retrieval-query').value = 'Portland';
  app.read('inspectQuery()');
  assert.match(app.elements.get('retrieval-audit').textContent, /Recall withheld/);
  assert.doesNotMatch(app.elements.get('retrieval-audit').textContent, /sunshine/);
});

test('independent Python verifier agrees with browser decisions and rejects damaged export', () => {
  const app = boot();
  app.read('userHistory = ["Portland rain", "Portland sunshine", "Café México", "Portland rain"].map(text => ({text, tokens: tokenize(text), ts: 1}))');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remembrance-retrieval-'));
  const snapshotPath = path.join(dir, 'snapshot.json');
  const verifier = path.join(__dirname, '..', 'tools', 'verify_retrieval.py');
  try {
    fs.writeFileSync(snapshotPath, JSON.stringify(app.read('stateSnapshot()')));
    const scenarios = [
      ['Portland', 'ambiguous', null],
      ['Portland rain', 'supported', 3],
      ['Portland Portland rain', 'supported', 3],
      ['Café México', 'supported', 2],
      ['unrelated astronomy', 'no-evidence', null],
      ['what did I say?', 'no-evidence', null]
    ];
    for (const [query, status, index] of scenarios) {
      const browser = app.read(`inspectRetrieval(${JSON.stringify(query)})`);
      const run = spawnSync('python3', [verifier, snapshotPath], { input: query, encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const independent = JSON.parse(run.stdout);
      assert.equal(browser.status, status, query);
      assert.equal(browser.selected?.index ?? null, index, query);
      assert.equal(independent.status, browser.status, query);
      assert.equal(independent.selected_index, browser.selected?.index ?? null, query);
      assert.equal(independent.supported_count, browser.supportedCount, query);
      assert.equal(independent.ambiguity_count, browser.ambiguityCount, query);
      assert.deepEqual(independent.matches, Array.from(browser.matches), query);
      const [numerator, denominator = '1'] = (independent.score || '0').split('/');
      assert.ok(Math.abs(Number(numerator) / Number(denominator) - (browser.score || 0)) < 1e-9, query);
      assert.doesNotMatch(run.stdout, /Portland rain|Café México/);
    }
    fs.writeFileSync(snapshotPath, '{damaged');
    const invalid = spawnSync('python3', [verifier, snapshotPath], { input: 'Portland', encoding: 'utf8' });
    assert.equal(invalid.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('finite synthetic model: unsupported additions and repeated query words cannot create a citation', () => {
  const app = boot();
  const entries = ['amber river', 'amber stone', 'river stone', 'orchid', 'amber river'];
  const queries = ['amber', 'river', 'stone', 'orchid', 'amber river', 'nebula'];
  let cases = 0;
  for (const a of entries) for (const b of entries) for (const c of entries) {
    app.read(`userHistory = ${JSON.stringify([a, b, c])}.map(text => ({text, ts: 1}))`);
    for (const query of queries) {
      const original = app.read(`inspectRetrieval(${JSON.stringify(query)})`);
      const repeated = app.read(`inspectRetrieval(${JSON.stringify(query + ' ' + query.split(' ')[0])})`);
      assert.equal(repeated.status, original.status);
      assert.equal(repeated.selected?.index ?? null, original.selected?.index ?? null);
      if (original.selected) {
        assert.ok(original.matches.length > 0);
        assert.ok(original.matches.some(word => original.selected.text.includes(word)));
      }
      if (query !== 'nebula') {
        app.read('userHistory.push({text: "unrelated nebula", ts: 1})');
        const extended = app.read(`inspectRetrieval(${JSON.stringify(query)})`);
        assert.equal(extended.status, original.status);
        assert.equal(extended.selected?.index ?? null, original.selected?.index ?? null);
        app.read('userHistory.pop()');
      }
      cases++;
    }
  }
  assert.equal(cases, 750);
});
