#!/usr/bin/env node
'use strict';

// Independent, read-only check for portable v1 exports. No browser code is loaded.
const fs = require('node:fs');
const {createHash, createDecipheriv, pbkdf2Sync} = require('node:crypto');
const {createInterface} = require('node:readline');
const {Writable} = require('node:stream');

const PLAIN_LIMIT = 256 * 1024;
const ENCRYPTED_LIMIT = 512 * 1024;
const FORMAT = 'aru-remembrance-encrypted-v1';
const ITERATIONS = 600000;

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function decodeUtf8(bytes) {
  try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
  catch (_) { throw new Error('File is not valid UTF-8.'); }
}

function parseJson(bytes) {
  const text = decodeUtf8(bytes);
  try { return JSON.parse(text); }
  catch (_) { throw new Error('File is not valid JSON.'); }
}

function canonicalBase64(value, length) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Encrypted envelope is invalid.');
  }
  const bytes = Buffer.from(value, 'base64');
  if ((length !== null && bytes.length !== length) || bytes.toString('base64') !== value) {
    throw new Error('Encrypted envelope is invalid.');
  }
  return bytes;
}

function validateState(value, byteLength) {
  if (byteLength > PLAIN_LIMIT ||
      !exactKeys(value, ['schema_version', 'scope', 'saved_at', 'user_history', 'ledger_entries', 'field']) ||
      value.schema_version !== 1 || value.scope !== 'browser-local symbolic simulation') {
    throw new Error('Not a complete Remembrance Engine v1 export within 256 KB.');
  }
  if (typeof value.saved_at !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.saved_at) ||
      Number.isNaN(Date.parse(value.saved_at))) throw new Error('Export date is invalid.');
  const entry = (item, limit) => exactKeys(item, ['text', 'ts']) &&
    typeof item.text === 'string' && item.text.length > 0 && item.text.length <= limit &&
    Number.isSafeInteger(item.ts) && item.ts >= 0;
  if (!Array.isArray(value.user_history) || value.user_history.length > 40 ||
      !value.user_history.every(item => entry(item, 2000))) throw new Error('Memory entries are invalid.');
  if (!Array.isArray(value.ledger_entries) || value.ledger_entries.length > 3 ||
      !value.ledger_entries.every(item => entry(item, 29))) throw new Error('Retrieval labels are invalid.');
  if (!Array.isArray(value.field) || value.field.length !== 720 ||
      !value.field.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 2)) {
    throw new Error('Field snapshot is invalid.');
  }
  return value;
}

function envelopeBytes(envelope) {
  if (!exactKeys(envelope, ['ciphertext', 'format', 'iterations', 'iv', 'salt']) ||
      envelope.format !== FORMAT || envelope.iterations !== ITERATIONS ||
      typeof envelope.ciphertext !== 'string' ||
      envelope.ciphertext.length > Math.ceil((PLAIN_LIMIT + 16) / 3) * 4) {
    throw new Error('Encrypted envelope is invalid.');
  }
  const salt = canonicalBase64(envelope.salt, 16);
  const iv = canonicalBase64(envelope.iv, 12);
  const sealed = canonicalBase64(envelope.ciphertext, null);
  if (sealed.length < 16) throw new Error('Encrypted envelope is invalid.');
  return {salt, iv, sealed};
}

function openEncrypted({salt, iv, sealed}, passphrase) {
  const normalized = passphrase.normalize('NFC');
  if ([...normalized].length < 16 || [...normalized].length > 1024) {
    throw new Error('Passphrase must have 16 to 1024 characters.');
  }
  try {
    const key = pbkdf2Sync(normalized, salt, ITERATIONS, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(FORMAT, 'utf8'));
    decipher.setAuthTag(sealed.subarray(-16));
    return Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  } catch (_) {
    throw new Error('Decryption failed: wrong passphrase or altered file.');
  }
}

async function passphraseFromTerminal() {
  if (!process.stdin.isTTY) throw new Error('Encrypted file requires a terminal or --passphrase-stdin.');
  const muted = new Writable({write(_data, _encoding, done) { done(); }});
  const prompt = createInterface({input: process.stdin, output: muted, terminal: true});
  process.stderr.write('Passphrase: ');
  return new Promise((resolve, reject) => {
    prompt.once('SIGINT', () => { prompt.close(); reject(new Error('Passphrase entry cancelled.')); });
    prompt.question('', value => { prompt.close(); process.stderr.write('\n'); resolve(value); });
  });
}

async function passphraseFromStdin() {
  const parts = [];
  let total = 0;
  for await (const part of process.stdin) {
    total += part.length;
    if (total > 8192) throw new Error('Passphrase input is too large.');
    parts.push(part);
  }
  return decodeUtf8(Buffer.concat(parts));
}

async function main(args) {
  if (args.length < 1 || args.length > 2 ||
      (args.length === 2 && args[1] !== '--passphrase-stdin') || args[0].startsWith('--')) {
    throw new Error('Usage: node tools/verify_backup.cjs <export.json> [--passphrase-stdin]');
  }
  let bytes;
  let fd;
  try {
    fd = fs.openSync(args[0], 'r');
    const buffer = Buffer.alloc(ENCRYPTED_LIMIT + 1);
    let total = 0;
    while (total < buffer.length) {
      const received = fs.readSync(fd, buffer, total, buffer.length - total, null);
      if (received === 0) break;
      total += received;
    }
    bytes = buffer.subarray(0, total);
  } catch (error) {
    throw new Error('Could not read export file.');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (bytes.length > ENCRYPTED_LIMIT) throw new Error('File exceeds 512 KB.');
  const parsed = parseJson(bytes);
  let state, format, integrity;
  if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'format')) {
    if (parsed.format !== FORMAT) throw new Error('This format is not a portable v1 export.');
    const envelope = envelopeBytes(parsed);
    const passphrase = args[1] === '--passphrase-stdin'
      ? await passphraseFromStdin() : await passphraseFromTerminal();
    const plaintext = openEncrypted(envelope, passphrase);
    state = validateState(parseJson(plaintext), plaintext.length);
    format = FORMAT;
    integrity = 'aes-256-gcm-tag-verified';
  } else {
    state = validateState(parsed, bytes.length);
    format = 'unencrypted-v1';
    integrity = 'none';
  }
  const result = {
    result: 'valid-structure', format, integrity,
    memories: state.user_history.length,
    retrieval_labels: state.ledger_entries.length,
    field_values: state.field.length,
    saved_at: state.saved_at,
    file_sha256: createHash('sha256').update(bytes).digest('hex')
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`Verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
