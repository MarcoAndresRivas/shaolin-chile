require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');

let config;
try {
    config = loadConfig(process.env);
} catch (error) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(1);
}

const pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const app = createApp({ config, db: pool });

app.listen(config.port, async () => {
    console.log(`Server is running on port ${config.port}`);

    // Check DB Connection
    try {
        const connection = await pool.getConnection();
        console.log('Connected to the MySQL database.');
        connection.release();
    } catch (err) {
        console.error('Error connecting to MySQL database:', err.message);
    }
});
