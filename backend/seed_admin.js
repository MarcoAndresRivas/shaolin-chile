require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seedAdmin() {
    let connection;
    try {
        console.log('Conectando al servidor MySQL...');
        connection = await mysql.createConnection({
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'shaolin_chile'
        });

        const adminName = 'Admin Principal';
        const adminEmail = 'admin@shaolinchile.cl';
        const adminPassword = 'admin'; // Contraseña por defecto
        const rolId = 2; // Administrador

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

        console.log(`Creando usuario Admin (${adminEmail} / ${adminPassword})...`);
        const query = `
            INSERT INTO usuarios (nombre, email, password_hash, rol_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            nombre = VALUES(nombre), 
            password_hash = VALUES(password_hash), 
            rol_id = VALUES(rol_id)
        `;

        await connection.execute(query, [adminName, adminEmail, passwordHash, rolId]);

        console.log('¡Usuario Admin creado/actualizado exitosamente!');

    } catch (error) {
        console.error('Error al crear usuario admin:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seedAdmin();
