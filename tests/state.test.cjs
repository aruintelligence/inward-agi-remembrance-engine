const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  first.send('What did I say?');
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
