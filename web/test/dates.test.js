import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayInChile, addDays, monthRange } from '../src/lib/dates.js';

test('today in Chile follows the Santiago calendar, not UTC', () => {
  // 2026-12-01 02:30 UTC is still 30 November at 23:30 in Chile (UTC-3 in summer).
  assert.equal(todayInChile(new Date('2026-12-01T02:30:00Z')), '2026-11-30');
  assert.equal(todayInChile(new Date('2026-12-01T12:00:00Z')), '2026-12-01');
});

test('addDays moves across months and years', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('monthRange returns the first and last day of the month of a date', () => {
  assert.deepEqual(monthRange('2026-11-13'), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(monthRange('2028-02-10'), { desde: '2028-02-01', hasta: '2028-02-29' });
});
