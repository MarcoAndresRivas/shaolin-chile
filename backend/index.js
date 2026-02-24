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
const pool = mysql.createPool({
    host: process.env.DB_SERVER || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'shaolin_chile',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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
