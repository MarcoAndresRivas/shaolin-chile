require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seedAlumno() {
    let connection;
    try {
        console.log('Conectando al servidor MySQL...');
        connection = await mysql.createConnection({
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'shaolin_chile'
        });

        const alumnoName = 'Alumno de Prueba';
        const alumnoEmail = 'alumno@shaolinchile.cl';
        const alumnoPassword = 'alumno';
        const rolId = 5; // Alumno

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(alumnoPassword, saltRounds);

        console.log(`Creando Alumno (${alumnoEmail} / ${alumnoPassword})...`);
        const query = `
            INSERT INTO usuarios (nombre, email, password_hash, rol_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            nombre = VALUES(nombre), 
            password_hash = VALUES(password_hash), 
            rol_id = VALUES(rol_id)
        `;

        await connection.execute(query, [alumnoName, alumnoEmail, passwordHash, rolId]);
        console.log('¡Alumno creado exitosamente!');

    } catch (error) {
        console.error('Error al crear alumno:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seedAlumno();
