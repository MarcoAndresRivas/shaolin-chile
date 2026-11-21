// Ports the fetch standard refuses ("bad port"). Some systems hand them out as
// random ports (Windows can use 1024-15000), so a test server must avoid them.
// Checked against Node's fetch: every one of these fails with "bad port".
const BAD_PORTS = new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109,
    110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
    531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190,
    5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);
const isBadPort = (port) => BAD_PORTS.has(port);

const listen = (app) => new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const close = (server) => new Promise((resolve) => server.close(resolve));

// Starts an Express app on a random port fetch accepts, runs fn(baseUrl), then closes it.
async function withServer(app, fn) {
    let server = await listen(app);
    while (isBadPort(server.address().port)) {
        await close(server);
        server = await listen(app);
    }
    try {
        const { port } = server.address();
        return await fn(`http://127.0.0.1:${port}`);
    } finally {
        await close(server);
    }
}

module.exports = { withServer, isBadPort };
