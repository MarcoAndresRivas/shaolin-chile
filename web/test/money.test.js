import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPesos, parsePesos } from '../src/lib/money.js';

test('pesos are shown with a dollar sign and dots as thousands separators', () => {
  assert.equal(formatPesos(30000), '$30.000');
  assert.equal(formatPesos(1250000), '$1.250.000');
  assert.equal(formatPesos(0), '$0');
  assert.equal(formatPesos(-5000), '-$5.000');
});

test('typed amounts accept dots, spaces and a dollar sign and become whole pesos', () => {
  assert.equal(parsePesos('30.000'), 30000);
  assert.equal(parsePesos(' $ 1.250.000 '), 1250000);
  assert.equal(parsePesos('15000'), 15000);
});

test('amounts that are not whole positive pesos are rejected as null', () => {
  for (const value of ['', 'abc', '0', '-5', '10,5', '10.5.5x', null, undefined]) {
    assert.equal(parsePesos(value), null, String(value));
  }
});
