import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabFromHash, nextTab } from '../src/lib/tabs.js';

const IDS = ['interesados', 'escuela', 'finanzas'];

test('the tab comes from the URL hash when it names a known tab', () => {
  assert.equal(tabFromHash('#finanzas', IDS, 'interesados'), 'finanzas');
  assert.equal(tabFromHash('finanzas', IDS, 'interesados'), 'finanzas', 'the # is optional');
});

test('an unknown, empty or missing hash falls back to the default tab', () => {
  assert.equal(tabFromHash('#otra', IDS, 'interesados'), 'interesados');
  assert.equal(tabFromHash('', IDS, 'interesados'), 'interesados');
  assert.equal(tabFromHash(undefined, IDS, 'interesados'), 'interesados');
});

test('arrow keys move between tabs and wrap around the ends', () => {
  assert.equal(nextTab(IDS, 'interesados', 'ArrowRight'), 'escuela');
  assert.equal(nextTab(IDS, 'finanzas', 'ArrowRight'), 'interesados');
  assert.equal(nextTab(IDS, 'interesados', 'ArrowLeft'), 'finanzas');
  assert.equal(nextTab(IDS, 'escuela', 'ArrowLeft'), 'interesados');
});

test('Home and End jump to the first and last tab; other keys do nothing', () => {
  assert.equal(nextTab(IDS, 'escuela', 'Home'), 'interesados');
  assert.equal(nextTab(IDS, 'escuela', 'End'), 'finanzas');
  assert.equal(nextTab(IDS, 'escuela', 'Enter'), null);
  assert.equal(nextTab(IDS, 'desconocida', 'ArrowRight'), null);
});
