// Starts an Express app on a random port, runs fn(baseUrl), then closes it.
async function withServer(app, fn) {
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const { port } = server.address();
        return await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

module.exports = { withServer };
