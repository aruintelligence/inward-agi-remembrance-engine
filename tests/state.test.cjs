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
