const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
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
      await page.locator('#input').fill('Corvallis sunrise belongs to this vault');
      await page.getByRole('button', {name: 'SEND TO REMEMBRANCE'}).click();
      const plain = await page.evaluate(key => localStorage.getItem(key), storageKey);
      assert.match(plain, /Corvallis sunrise belongs to this vault/);

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
      const downloaded = fs.readFileSync(await download.path(), 'utf8');
      assert.equal(JSON.parse(downloaded).format, 'aru-remembrance-encrypted-v1');
      assert.doesNotMatch(downloaded, /Corvallis sunrise|A second private/);

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
      assert.deepEqual(remoteRequests, []);
      assert.deepEqual(pageErrors, []);
      await receiver.close();
      await context.close();
    } finally {
      if (browser) await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
