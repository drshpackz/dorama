'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMock, loadPlugin } = require('./helpers/lampa-mock');

function load() { return loadPlugin(makeMock()); }

test('rowPage stays on page 1 when depth <= 1 (no rotation)', () => {
  const { _rowPage } = load();
  assert.strictEqual(_rowPage('any', 0, 1), 1);
  assert.strictEqual(_rowPage('any', 99, 1), 1);
  assert.strictEqual(_rowPage('any', 7), 1); // missing depth defaults to 1
});

test('rowPage is deterministic and stays within 1..depth', () => {
  const { _rowPage } = load();
  assert.strictEqual(_rowPage('Сейчас смотрят', 3, 3), _rowPage('Сейчас смотрят', 3, 3));
  for (let seed = 0; seed < 50; seed++) {
    const p = _rowPage('Корейские комедии', seed, 3);
    assert.ok(p >= 1 && p <= 3, 'page out of range: ' + p);
  }
});

test('rowPage advances the page as the per-open seed advances', () => {
  const { _rowPage } = load();
  const pages = [0, 1, 2].map(s => _rowPage('Сейчас смотрят', s, 3));
  assert.ok(new Set(pages).size > 1, 'different opens should surface different pages');
});

test('rowPage varies by category (row key affects the page)', () => {
  const { _rowPage } = load();
  const keys = ['Сейчас смотрят', 'Корейские комедии', 'Боевики и экшен', 'Романтические дорамы'];
  const pages = keys.map(k => _rowPage(k, 0, 3));
  assert.ok(new Set(pages).size > 1, 'categories should not all land on the same page');
});
