const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
    try {
        console.log('Connectando al servidor MySQL...');
        // Conectar a MySQL sin especificar base de datos primero para poder crearla
        const connection = await mysql.createConnection({
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Creando la base de datos shaolin_chile si no existe...');
        await connection.query('CREATE DATABASE IF NOT EXISTS shaolin_chile;');

        console.log('Usando base de datos shaolin_chile...');
        await connection.query('USE shaolin_chile;');

        console.log('Creando la tabla de representantes...');
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS representantes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                sede VARCHAR(255) NOT NULL,
                mensaje TEXT,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await connection.query(createTableQuery);

        console.log('¡Base de datos y tabla creadas exitosamente!');
        await connection.end();
    } catch (error) {
        console.error('Error al configurar la base de datos:', error);
    }
}

setupDatabase();
