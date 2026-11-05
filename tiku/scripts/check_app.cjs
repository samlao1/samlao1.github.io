// Exercise the real application handlers with an isolated DOM/storage fixture.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bankContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/questions.js'), 'utf8'), bankContext);
const bank = bankContext.window.QUESTION_BANK;
const storage = new Map();
function boot(blockStorage = false) {
  const elements = [];
  class Element {
    constructor(attrs = '', parent = null) {
      this.attrs = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      this.id = this.attrs.id;
      this.dataset = Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5),v]));
      this.classes = new Set((this.attrs.class || '').split(' '));
      this.classList = { contains: c => this.classes.has(c), add: c => this.classes.add(c), remove: c => this.classes.delete(c), toggle: (c, b) => b ? this.classes.add(c) : this.classes.delete(c) };
      this.parent = parent; this.events = {}; this.style = {}; this.value = ''; this.textContent = '';
      elements.push(this);
    }
    set innerHTML(html) {
      this.html = html;
      for (let i = elements.length - 1; i >= 0; i--) if (elements[i].parent === this) elements.splice(i, 1);
      for (const m of html.matchAll(/<button\s+([^>]+)>/g)) new Element(m[1], this);
    }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(k, v) { this.attrs[k] = v; }
    focus() {}
    matches() { return false; }
    click() { this.events.click?.({target:this}); }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<\w+\s+([^>]+)>/g)) new Element(m[1]);
  const queryAll = s => elements.filter(e => s.startsWith('#') ? e.id === s.slice(1) : s.startsWith('.') ? e.classes.has(s.slice(1)) : s === '[data-count]' && e.dataset.count);
  const document = {querySelector:s => queryAll(s)[0], querySelectorAll:queryAll, addEventListener() {}};
  const window = { QUESTION_BANK:bank, setTimeout:() => 1, clearTimeout() {}, scrollTo() {}, confirm:() => true };
  const localStorage = {getItem:k => storage.get(k), setItem:(k,v) => { if (blockStorage) throw Error('blocked'); storage.set(k,v); }};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {document,window,localStorage});
  return { get:s => document.querySelector(s), click:s => document.querySelector(s).click(), mode:m => queryAll('.mode-button').find(e => e.dataset.mode === m).click(), filter:f => queryAll('.filter-button').find(e => e.dataset.filter === f).click(), option:k => queryAll('.option-button').find(e => e.dataset.key === k).click() };
}
for (const q of bank.questions) {
  assert.ok(q.answer.every(key => q.options.some(o => o.key === key)), q.id);
  assert.equal(new Set(q.answer).size, q.answer.length);
  if (q.type !== 'multiple') assert.equal(q.answer.length, 1);
}
let app = boot();
app.click('#submitButton');
assert.equal(app.get('#completedCount').textContent, 0);
app.option('A'); app.click('#submitButton');
assert.equal(app.get('#wrongCount').textContent, 1);
assert.equal(app.get('#completedCount').textContent, 1);
app.click('#retryButton');
assert.equal(app.get('#completedCount').textContent, 0);
app.option('C'); app.click('#submitButton');
assert.equal(app.get('#correctCount').textContent, 1);
assert.equal(app.get('#wrongCount').textContent, 1); // Wrong history persists after correction.
app.mode('answer'); app.click('#nextButton');
assert.match(app.get('#questionView').html, /ANSWER &amp; EXPLANATION/);
assert.equal(app.get('#completedCount').textContent, 1);
app = boot();
assert.equal(app.get('#questionInput').value, 2);
assert.match(app.get('#questionView').html, /ANSWER &amp; EXPLANATION/);
app.mode('quiz'); app.filter('multiple');
app.option('A'); app.option('B'); app.option('C'); app.click('#submitButton');
assert.equal(app.get('#wrongCount').textContent, 2); // Partial answers fail.
app.click('#retryButton');
for (const key of ['D','B','A','C']) app.option(key);
app.click('#submitButton');
assert.equal(app.get('#correctCount').textContent, 2);
app.filter('boolean'); app.option('B'); app.click('#submitButton');
assert.equal(app.get('#correctCount').textContent, 3);
app.click('#wrongListButton'); app.click('.wrong-item');
app = boot();
assert.match(app.get('#questionView').html, /class="type-pill">单选题/);
app.get('#questionInput').value = '3.7'; app.click('#jumpButton');
assert.equal(app.get('#questionInput').value, 3);
app.click('#resetButton'); app = boot();
assert.equal(app.get('#completedCount').textContent, 0);
assert.equal(app.get('#wrongCount').textContent, 0);
assert.equal(app.get('#questionInput').value, 1);
app = boot(true); app.option('C'); app.click('#submitButton');
assert.equal(app.get('#correctCount').textContent, 1);
assert.match(app.get('#saveState').textContent, /无法保存/);
console.log('PASS: 200 question answer mappings; selection, grading, multi-select, boolean, answer mode, reload, wrong history, retry, jump, reset and unavailable storage.');
