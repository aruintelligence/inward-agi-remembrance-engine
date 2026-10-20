const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const pageHtml = fs.readFileSync(path.join(__dirname, '..', 'inward-agi-remembrance-engine-v11.html'));
const storageKey = 'aru_remembrance_engine_v11_state';
const vaultPassword = 'a unique browser vault passphrase 2026';
const rotatedVaultPassword = 'a newly rotated browser vault passphrase 2026';
const portablePassword = 'a different portable passphrase 2026';

test('real browser: offline runtime, protected saves, lock, unlock, download, and reviewed transfer',
  {timeout: 120000}, async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/engine.html') {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
        res.end(pageHtml);
      } else {
        res.writeHead(204);
        res.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch({headless: true});
      const context = await browser.newContext({acceptDownloads: true});
      const page = await context.newPage();
      const pageErrors = [];
      const remoteRequests = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) {
          remoteRequests.push(request.url());
        }
      });

      await page.goto(origin + '/engine.html');
      assert.equal(await page.evaluate(() => !!globalThis.crypto?.subtle), true);
      await page.getByRole('button', {name: 'Pause ambient motion'}).click();
      assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
      const pausedField = await page.evaluate(() => Array.from(mu));
      await page.waitForTimeout(120);
      assert.deepEqual(await page.evaluate(() => Array.from(mu)), pausedField);
      await page.getByRole('button', {name: 'Resume ambient motion'}).click();
      await page.waitForFunction(previous => mu.some((value, index) => value !== previous[index]), pausedField);
      await page.locator('#input').fill('Corvallis sunrise belongs to this vault');
      await page.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      const plain = await page.evaluate(key => localStorage.getItem(key), storageKey);
      assert.match(plain, /Corvallis sunrise belongs to this vault/);
      const exitWarning = () => {
        const event = new Event('beforeunload', {cancelable: true});
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      assert.equal(await page.evaluate(exitWarning), false);
      await page.locator('#retrieval-query').fill('Which ATM client is in Corvallis?');
      await page.getByRole('button', {name: 'Inspect recall'}).click();
      assert.match(await page.locator('#retrieval-audit').textContent(), /Recall withheld/);
      assert.doesNotMatch(await page.locator('#retrieval-audit').textContent(), /Corvallis sunrise belongs/);
      await page.locator('#retrieval-query').fill('Corvallis sunrise');
      await page.getByRole('button', {name: 'Inspect recall'}).click();
      assert.match(await page.locator('#retrieval-audit').textContent(), /Corvallis sunrise belongs/);

      await page.locator('#vault-passphrase').fill(vaultPassword);
      await page.locator('#vault-confirm').fill(vaultPassword);
      await page.getByRole('button', {name: 'Encrypt browser state'}).click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).format === 'aru-remembrance-vault-v1', storageKey);
      const firstVault = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey));
      assert.doesNotMatch(JSON.stringify(firstVault), /Corvallis sunrise belongs to this vault/);

      await page.reload();
      assert.equal(await page.locator('#vault-lock').isVisible(), true);
      assert.equal(await page.locator('#app-shell').evaluate(el => el.inert), true);
      assert.doesNotMatch(await page.locator('#chat').textContent(), /Corvallis sunrise/);
      await page.locator('#vault-unlock-passphrase').fill('wrong but sufficiently long');
      await page.getByRole('button', {name: 'Unlock browser vault'}).click();
      await page.locator('#vault-unlock-status').filter({hasText: /Wrong passphrase or damaged/}).waitFor();
      assert.equal(await page.locator('#vault-lock').isVisible(), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), JSON.stringify(firstVault));

      await page.locator('#vault-unlock-passphrase').fill(vaultPassword);
      await page.getByRole('button', {name: 'Unlock browser vault'}).click();
      await page.locator('#vault-lock').waitFor({state: 'hidden'});
      assert.equal(await page.locator('#memory-depth').textContent(), '1');

      await page.getByText('Change browser vault passphrase').click();
      await page.locator('#vault-rotate-current').fill('a wrong current passphrase');
      await page.locator('#vault-rotate-new').fill(rotatedVaultPassword);
      await page.locator('#vault-rotate-confirm').fill(rotatedVaultPassword);
      await page.getByRole('button', {name: 'Change vault passphrase'}).click();
      await page.locator('#vault-status').filter({hasText: /Current passphrase is incorrect/}).waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), JSON.stringify(firstVault));

      await page.locator('#vault-rotate-current').fill(vaultPassword);
      await page.locator('#vault-rotate-new').fill(rotatedVaultPassword);
      await page.locator('#vault-rotate-confirm').fill(rotatedVaultPassword);
      await page.getByRole('button', {name: 'Change vault passphrase'}).click();
      await page.waitForFunction(({key, oldSalt}) => JSON.parse(localStorage.getItem(key)).salt !== oldSalt,
        {key: storageKey, oldSalt: firstVault.salt});
      const rotatedVault = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey));
      assert.notEqual(rotatedVault.iv, firstVault.iv);
      assert.equal(await page.locator('#vault-rotate-current').inputValue(), '');
      await page.reload();
      await page.locator('#vault-unlock-passphrase').fill(vaultPassword);
      await page.getByRole('button', {name: 'Unlock browser vault'}).click();
      await page.locator('#vault-unlock-status').filter({hasText: /Wrong passphrase or damaged/}).waitFor();
      assert.equal(await page.locator('#vault-lock').isVisible(), true);
      await page.locator('#vault-unlock-passphrase').fill(rotatedVaultPassword);
      await page.getByRole('button', {name: 'Unlock browser vault'}).click();
      await page.locator('#vault-lock').waitFor({state: 'hidden'});
      assert.equal(await page.locator('#memory-depth').textContent(), '1');

      await page.locator('#input').fill('A second private Corvallis memory');
      await page.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await page.waitForFunction(() => document.getElementById('storage-status').textContent.includes('Saved changes are encrypted here'));
      const secondVault = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey));
      assert.notEqual(secondVault.iv, rotatedVault.iv);
      assert.equal(secondVault.salt, rotatedVault.salt);
      assert.doesNotMatch(JSON.stringify(secondVault), /A second private Corvallis memory/);

      await page.getByRole('button', {name: 'Lock browser vault'}).click();
      await page.locator('#vault-lock').waitFor({state: 'visible'});
      assert.doesNotMatch(await page.locator('#chat').textContent(), /Corvallis memory|Corvallis sunrise/);
      await page.locator('#vault-unlock-passphrase').fill(rotatedVaultPassword);
      await page.getByRole('button', {name: 'Unlock browser vault'}).click();
      await page.locator('#vault-lock').waitFor({state: 'hidden'});
      assert.equal(await page.locator('#memory-depth').textContent(), '2');

      await page.locator('#export-passphrase').fill(portablePassword);
      await page.locator('#export-confirm').fill(portablePassword);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', {name: 'Download encrypted JSON'}).click();
      const download = await downloadPromise;
      const downloadedPath = await download.path();
      const downloaded = fs.readFileSync(downloadedPath, 'utf8');
      assert.equal(JSON.parse(downloaded).format, 'aru-remembrance-encrypted-v1');
      assert.doesNotMatch(downloaded, /Corvallis sunrise|A second private/);
      const verified = spawnSync(process.execPath,
        [path.join(__dirname, '..', 'tools', 'verify_backup.cjs'), downloadedPath, '--passphrase-stdin'],
        {input: portablePassword, encoding: 'utf8'});
      assert.equal(verified.status, 0, verified.stderr);
      assert.equal(JSON.parse(verified.stdout).memories, 2);
      assert.equal(JSON.parse(verified.stdout).integrity, 'aes-256-gcm-tag-verified');
      assert.doesNotMatch(verified.stdout, /Corvallis sunrise|A second private/);

      await page.getByText('Review and remove saved memories').click();
      await page.getByRole('button', {name: 'Review removal of memory 1', exact: true}).click();
      assert.equal(await page.locator('#forget-preview').textContent(), 'Corvallis sunrise belongs to this vault');
      const beforeRemoval = await page.evaluate(key => localStorage.getItem(key), storageKey);
      await page.locator('#input').fill('Vault draft waiting for a space');
      await page.getByRole('button', {name: 'Remove this saved entry'}).click();
      await page.waitForFunction(({key, before}) => localStorage.getItem(key) !== before,
        {key: storageKey, before: beforeRemoval});
      assert.notEqual(await page.evaluate(key => localStorage.getItem(key), storageKey), beforeRemoval);
      assert.equal(await page.locator('#vault-lock').isVisible(), false);
      assert.equal(await page.locator('#input').inputValue(), 'Vault draft waiting for a space');
      assert.equal(await page.locator('#memory-depth').textContent(), '1');
      assert.equal(await page.locator('#memory-entries').textContent().then(text => text.includes('Corvallis sunrise belongs')), false);
      assert.doesNotMatch(await page.locator('#chat').textContent(), /Corvallis sunrise belongs/);

      const receiver = await browser.newContext();
      const receivingPage = await receiver.newPage();
      receivingPage.on('pageerror', error => pageErrors.push(error.message));
      await receivingPage.goto(origin + '/engine.html');
      await receivingPage.locator('#state-file').setInputFiles({
        name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(downloaded)
      });
      await receivingPage.locator('#import-passphrase').fill(portablePassword);
      await receivingPage.getByRole('button', {name: 'Review selected JSON'}).click();
      await receivingPage.locator('#import-summary').filter({hasText: /2 incoming memories/}).waitFor();
      assert.equal(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey), null);
      await Promise.all([
        receivingPage.waitForEvent('load'),
        receivingPage.getByRole('button', {name: 'Replace local state with this file'}).click()
      ]);
      assert.equal(await receivingPage.locator('#memory-depth').textContent(), '2');
      assert.equal(JSON.parse(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey)).user_history.length, 2);
      await receivingPage.getByText('Review and remove saved memories').click();
      await receivingPage.getByRole('button', {name: 'Review removal of memory 1', exact: true}).click();
      await receivingPage.getByRole('button', {name: 'Remove this saved entry'}).click();
      await receivingPage.locator('#memory-depth').filter({hasText: /^1$/}).waitFor();
      const remaining = JSON.parse(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey));
      assert.deepEqual(remaining.user_history.map(entry => entry.text), ['A second private Corvallis memory']);
      assert.ok(remaining.field.every(value => value === 0.1));

      await receivingPage.evaluate(() => {
        for (let index = 0; index < 39; index++) {
          document.getElementById('input').value = `Capacity filler ${index}`;
          sendToField();
        }
      });
      assert.equal(await receivingPage.locator('#memory-depth').textContent(), '40');
      const fullSnapshot = await receivingPage.evaluate(key => localStorage.getItem(key), storageKey);
      await receivingPage.locator('#input').fill('The forty-first browser draft');
      await receivingPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      assert.equal(await receivingPage.locator('#input').inputValue(), 'The forty-first browser draft');
      assert.match(await receivingPage.locator('#send-status').textContent(), /Entry not saved/);
      assert.equal(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey), fullSnapshot);
      await receivingPage.getByRole('button', {name: 'Manage memories'}).click();
      assert.equal(await receivingPage.locator('#memory-control').evaluate(el => el.open), true);
      await receivingPage.getByRole('button', {name: 'Review removal of memory 1', exact: true}).click();
      await receivingPage.getByRole('button', {name: 'Remove this saved entry'}).click();
      await receivingPage.locator('#memory-depth').filter({hasText: /^39$/}).waitFor();
      assert.equal(await receivingPage.locator('#input').inputValue(), 'The forty-first browser draft');
      await receivingPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      assert.equal(await receivingPage.locator('#memory-depth').textContent(), '40');
      assert.equal(JSON.parse(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey)).user_history.at(-1).text,
        'The forty-first browser draft');
      receivingPage.on('dialog', dialog => dialog.accept());
      await receivingPage.evaluate(() => {
        localStorage.setItem('unrelated', 'keep');
        window.originalRemoveItem = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function(key) {
          if (key === 'aru_remembrance_engine_v11_state') throw new Error('blocked deletion');
          return window.originalRemoveItem.call(this, key);
        };
      });
      const beforeErase = await receivingPage.evaluate(key => localStorage.getItem(key), storageKey);
      await receivingPage.getByRole('button', {name: 'Erase local state'}).click();
      await receivingPage.locator('#erase-status').filter({hasText: /Erase not confirmed/}).waitFor();
      assert.equal(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey), beforeErase);
      assert.equal(await receivingPage.locator('#memory-depth').textContent(), '40');
      await receivingPage.evaluate(() => { Storage.prototype.removeItem = window.originalRemoveItem; });
      await Promise.all([
        receivingPage.waitForEvent('load'),
        receivingPage.getByRole('button', {name: 'Erase local state'}).click()
      ]);
      assert.equal(await receivingPage.evaluate(key => localStorage.getItem(key), storageKey), null);
      assert.equal(await receivingPage.evaluate(() => localStorage.getItem('unrelated')), 'keep');
      const conflictContext = await browser.newContext({acceptDownloads: true});
      const writer = await conflictContext.newPage();
      const stalePage = await conflictContext.newPage();
      for (const tab of [writer, stalePage]) tab.on('pageerror', error => pageErrors.push(error.message));
      await writer.goto(origin + '/engine.html');
      await writer.locator('#input').fill('Shared browser entry');
      await writer.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await stalePage.goto(origin + '/engine.html');
      await stalePage.getByRole('button', {name: 'Pause ambient motion'}).click();
      const staleField = await stalePage.evaluate(() => Array.from(mu));
      const staleChat = await stalePage.locator('#chat').textContent();
      await writer.locator('#input').fill('Writer has the latest value');
      await writer.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await stalePage.locator('#recovery-panel').waitFor({state: 'visible'});
      const latestSaved = await stalePage.evaluate(key => localStorage.getItem(key), storageKey);
      await stalePage.locator('#input').fill('A draft from the stale tab');
      await stalePage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      assert.equal(await stalePage.locator('#input').inputValue(), 'A draft from the stale tab');
      assert.match(await stalePage.locator('#send-status').textContent(), /Input paused/);
      assert.equal(await stalePage.locator('#memory-depth').textContent(), '1');
      assert.equal(await stalePage.locator('#chat').textContent(), staleChat);
      assert.deepEqual(await stalePage.evaluate(() => Array.from(mu)), staleField);
      assert.equal(await stalePage.evaluate(key => localStorage.getItem(key), storageKey), latestSaved);
      await stalePage.getByRole('button', {name: 'Show backup options'}).click();
      assert.equal(await stalePage.evaluate(() => document.activeElement.id), 'backup-download');
      const backupPromise = stalePage.waitForEvent('download');
      await stalePage.getByRole('button', {name: 'Download unencrypted JSON'}).click();
      const backup = JSON.parse(fs.readFileSync(await (await backupPromise).path(), 'utf8'));
      assert.deepEqual(backup.user_history.map(entry => entry.text), ['Shared browser entry']);
      assert.deepEqual(JSON.parse(latestSaved).user_history.map(entry => entry.text),
        ['Shared browser entry', 'Writer has the latest value']);
      await conflictContext.close();
      const vaultConflictContext = await browser.newContext({acceptDownloads: true});
      const localVaultPage = await vaultConflictContext.newPage();
      const newerVaultPage = await vaultConflictContext.newPage();
      localVaultPage.on('pageerror', error => pageErrors.push(error.message));
      newerVaultPage.on('pageerror', error => pageErrors.push(error.message));
      await localVaultPage.goto(origin + '/engine.html');
      await localVaultPage.locator('#input').fill('Shared protected start');
      await localVaultPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await localVaultPage.locator('#vault-passphrase').fill(vaultPassword);
      await localVaultPage.locator('#vault-confirm').fill(vaultPassword);
      await localVaultPage.getByRole('button', {name: 'Encrypt browser state'}).click();
      await localVaultPage.waitForFunction(key => JSON.parse(localStorage.getItem(key)).format === 'aru-remembrance-vault-v1', storageKey);
      const beforeConflict = await localVaultPage.evaluate(key => localStorage.getItem(key), storageKey);
      await newerVaultPage.goto(origin + '/engine.html');
      await newerVaultPage.locator('#vault-unlock-passphrase').fill(vaultPassword);
      await newerVaultPage.getByRole('button', {name: 'Unlock browser vault'}).click();
      await newerVaultPage.locator('#vault-lock').waitFor({state: 'hidden'});
      await localVaultPage.evaluate(() => {
        window.originalSealForConflict = sealVaultState;
        window.localSealStarted = new Promise(resolve => { window.markLocalSeal = resolve; });
        sealVaultState = async (...args) => {
          window.markLocalSeal();
          await new Promise(resolve => { window.releaseLocalSeal = resolve; });
          return window.originalSealForConflict(...args);
        };
      });
      await localVaultPage.locator('#input').fill('Local pending protected edit');
      await localVaultPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await localVaultPage.evaluate(() => window.localSealStarted);
      await newerVaultPage.locator('#input').fill('Newer protected edit from other tab');
      await newerVaultPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await newerVaultPage.waitForFunction(({key, old}) => localStorage.getItem(key) !== old,
        {key: storageKey, old: beforeConflict});
      const newerVaultRaw = await newerVaultPage.evaluate(key => localStorage.getItem(key), storageKey);
      await localVaultPage.locator('#recovery-panel').waitFor({state: 'visible'});
      assert.equal(await localVaultPage.locator('#vault-lock').isVisible(), false);
      assert.equal(await localVaultPage.evaluate(exitWarning), true);
      await localVaultPage.getByRole('button', {name: 'Show backup options'}).click();
      assert.equal(await localVaultPage.evaluate(() => document.activeElement.id), 'export-passphrase');
      await localVaultPage.evaluate(() => { window.releaseLocalSeal(); });
      await localVaultPage.waitForFunction(() => vaultPendingWrites === 0);
      assert.equal(await localVaultPage.evaluate(key => localStorage.getItem(key), storageKey), newerVaultRaw);
      const recoveryDownload = localVaultPage.waitForEvent('download');
      await localVaultPage.getByRole('button', {name: 'Download unencrypted JSON'}).click();
      const recoveredSession = JSON.parse(fs.readFileSync(await (await recoveryDownload).path(), 'utf8'));
      assert.deepEqual(recoveredSession.user_history.map(entry => entry.text),
        ['Shared protected start', 'Local pending protected edit']);
      assert.equal(await localVaultPage.evaluate(key => localStorage.getItem(key), storageKey), newerVaultRaw);
      await vaultConflictContext.close();
      const exportContext = await browser.newContext({acceptDownloads: true});
      const exportPage = await exportContext.newPage();
      exportPage.on('pageerror', error => pageErrors.push(error.message));
      exportPage.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) remoteRequests.push(request.url());
      });
      await exportPage.goto(origin + '/engine.html');
      await exportPage.locator('#input').fill('Before portable export');
      await exportPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      const incoming = await exportPage.evaluate(() => ({...stateSnapshot(),
        user_history: [{text: 'Incoming reviewed memory', ts: Date.now()}]}));
      await exportPage.locator('#state-file').setInputFiles({
        name: 'incoming.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming))
      });
      await exportPage.getByRole('button', {name: 'Review selected JSON'}).click();
      await exportPage.locator('#import-status').filter({hasText: /Review complete/}).waitFor();
      await exportPage.evaluate(() => {
        window.originalEncryptPortableState = encryptPortableState;
        window.originalDownloadJson = downloadJson;
        window.downloadStarts = 0;
        downloadJson = (...args) => { window.downloadStarts++; return window.originalDownloadJson(...args); };
        window.exportStarted = new Promise(resolve => { window.markExportStarted = resolve; });
        encryptPortableState = async (...args) => {
          window.markExportStarted();
          await new Promise(resolve => { window.finishExport = resolve; });
          return window.originalEncryptPortableState(...args);
        };
      });
      await exportPage.locator('#export-passphrase').fill(portablePassword);
      await exportPage.locator('#export-confirm').fill(portablePassword);
      await exportPage.getByRole('button', {name: 'Download encrypted JSON'}).click();
      await exportPage.evaluate(() => window.exportStarted);
      assert.equal(await exportPage.evaluate(exitWarning), true);
      const beforeOverlap = await exportPage.evaluate(key => localStorage.getItem(key), storageKey);
      await exportPage.locator('#import-commit').click();
      assert.match(await exportPage.locator('#import-status').textContent(), /Restore paused/);
      await exportPage.getByRole('button', {name: 'Erase local state'}).click();
      assert.match(await exportPage.locator('#erase-status').textContent(), /Erase paused/);
      assert.equal(await exportPage.evaluate(key => localStorage.getItem(key), storageKey), beforeOverlap);
      await exportPage.locator('#input').fill('Added before encryption finished');
      await exportPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      await exportPage.evaluate(() => { window.finishExport(); encryptPortableState = window.originalEncryptPortableState; });
      await exportPage.locator('#crypto-status').filter({hasText: /Session changed while encrypting/}).waitFor();
      assert.equal(await exportPage.evaluate(exitWarning), false);
      assert.equal(await exportPage.evaluate(() => window.downloadStarts), 0);
      assert.equal(await exportPage.locator('#export-passphrase').inputValue(), '');
      await exportPage.locator('#export-passphrase').fill(portablePassword);
      await exportPage.locator('#export-confirm').fill(portablePassword);
      const freshDownloadPromise = exportPage.waitForEvent('download');
      await exportPage.getByRole('button', {name: 'Download encrypted JSON'}).click();
      const freshBackup = fs.readFileSync(await (await freshDownloadPromise).path(), 'utf8');
      assert.equal(await exportPage.evaluate(() => window.downloadStarts), 1);
      assert.equal(JSON.parse(freshBackup).format, 'aru-remembrance-encrypted-v1');
      assert.match(await exportPage.locator('#crypto-status').textContent(), /copy started for 2 memories/);
      assert.equal(await exportPage.evaluate(exitWarning), false);
      await exportContext.close();
      const blockedContext = await browser.newContext();
      await blockedContext.addInitScript(key => {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(name, value) {
          if (name === key) throw new Error('Storage write blocked for test');
          return originalSetItem.call(this, name, value);
        };
      }, storageKey);
      const blockedPage = await blockedContext.newPage();
      blockedPage.on('pageerror', error => pageErrors.push(error.message));
      await blockedPage.goto(origin + '/engine.html');
      assert.equal(await blockedPage.evaluate(exitWarning), false);
      await blockedPage.locator('#input').fill('An entry held only in this page');
      await blockedPage.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      assert.equal(await blockedPage.evaluate(exitWarning), true);
      assert.equal(await blockedPage.evaluate(key => localStorage.getItem(key), storageKey), null);
      await blockedContext.close();
      const reducedContext = await browser.newContext({reducedMotion: 'reduce'});
      const reducedPage = await reducedContext.newPage();
      reducedPage.on('pageerror', error => pageErrors.push(error.message));
      reducedPage.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) remoteRequests.push(request.url());
      });
      await reducedPage.goto(origin + '/engine.html');
      assert.equal(await reducedPage.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
      assert.equal(await reducedPage.locator('.mirror-core').first().evaluate(el => getComputedStyle(el).animationName), 'none');
      const reducedField = await reducedPage.evaluate(() => Array.from(mu));
      await reducedPage.waitForTimeout(120);
      assert.deepEqual(await reducedPage.evaluate(() => Array.from(mu)), reducedField);
      await reducedPage.getByRole('button', {name: 'Resume ambient motion'}).click();
      await reducedPage.waitForFunction(previous => mu.some((value, index) => value !== previous[index]), reducedField);
      await reducedContext.close();
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      await receiver.close();
      await context.close();
    } finally {
      if (browser) await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
