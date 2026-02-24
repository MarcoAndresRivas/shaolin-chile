const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Setup
const dbConfig = {
    host: process.env.DB_SERVER || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'shaolin_chile',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

if (process.env.DB_SSL === 'true' || (process.env.DB_SERVER && process.env.DB_SERVER.includes('aivencloud'))) {
    dbConfig.ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool(dbConfig);

// Pass db pool to routes
app.use((req, res, next) => {
    req.db = pool;
    next();
});

// Routes
const authRoutes = require('./routes/auth');
const intranetRoutes = require('./routes/intranet');

app.use('/api', authRoutes);
app.use('/api/intranet', intranetRoutes);

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);

    // Check DB Connection
    try {
        const connection = await pool.getConnection();
        console.log('Connected to the MySQL database.');
        connection.release();
    } catch (err) {
        console.error('Error connecting to MySQL database:', err.message);
    }
});
