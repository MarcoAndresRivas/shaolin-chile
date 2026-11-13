import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabFromHash, nextTab, mergeTabs } from '../src/lib/tabs.js';

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

test('several roles share one tab bar, in order, keeping the first tab of each id', () => {
  const admin = [{ id: 'finanzas', label: 'Finanzas' }, { id: 'examenes', label: 'Exámenes y grados' }];
  const instructor = [{ id: 'mis-clases', label: 'Mis clases' }, { id: 'examenes', label: 'Exámenes' }];
  const merged = mergeTabs(admin, instructor);
  assert.deepEqual(merged.map((t) => t.id), ['finanzas', 'examenes', 'mis-clases']);
  assert.equal(merged.find((t) => t.id === 'examenes').label, 'Exámenes y grados', 'the first one wins');
});

test('merging nothing, or empty lists, gives no tabs', () => {
  assert.deepEqual(mergeTabs(), []);
  assert.deepEqual(mergeTabs([], []), []);
});
