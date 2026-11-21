// mysql2 returns DATE columns as local-time Date objects; SQLite returns text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isoDay } = require('../src/dates');

test('isoDay gives YYYY-MM-DD from a MySQL Date or a SQLite string', () => {
    assert.equal(isoDay(new Date(2015, 2, 20)), '2015-03-20');
    assert.equal(isoDay(new Date(2015, 11, 31, 23, 30)), '2015-12-31', 'local date, not shifted to UTC');
    assert.equal(isoDay('2015-03-20'), '2015-03-20');
    assert.equal(isoDay('2015-03-20 00:00:00'), '2015-03-20');
    assert.equal(isoDay(null), null);
});
