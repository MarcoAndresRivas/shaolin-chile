// The test server must never listen on a port that fetch refuses ("bad port").
const test = require('node:test');
const assert = require('node:assert/strict');
const { withServer, isBadPort } = require('./helpers');

test('the ports fetch refuses are recognized, and ordinary ones are not', () => {
    for (const port of [6000, 6665, 6669, 10080, 5060, 4045]) assert.equal(isBadPort(port), true, String(port));
    for (const port of [3000, 6001, 6670, 10081, 49152, 54321]) assert.equal(isBadPort(port), false, String(port));
});

test('a server given a refused port is closed and started again on another one', async () => {
    const ports = [6000, 10080, 45678];
    const closed = [];
    const app = {
        listen(port, host, ready) {
            const assigned = ports.shift();
            const server = { address: () => ({ port: assigned }), close: (done) => { closed.push(assigned); done(); } };
            setImmediate(ready);
            return server;
        },
    };
    const used = await withServer(app, async (baseUrl) => baseUrl);
    assert.equal(used, 'http://127.0.0.1:45678');
    assert.deepEqual(closed, [6000, 10080, 45678], 'the refused servers are closed first, the good one at the end');
});
