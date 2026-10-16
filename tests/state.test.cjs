const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'inward-agi-remembrance-engine-v11.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const key = 'aru_remembrance_engine_v11_state';

function boot(saved = new Map(), storageBlocked = false) {
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
    setItem(k, v) { if (storageBlocked) throw new Error('blocked'); saved.set(k, v); },
    removeItem(k) { if (storageBlocked) throw new Error('blocked'); saved.delete(k); }
  };
  const window = {
    confirm() { return true; },
    location: { reload() { window.reloaded = true; } }
  };
  const context = vm.createContext({
    document, localStorage, window, Blob, console,
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
