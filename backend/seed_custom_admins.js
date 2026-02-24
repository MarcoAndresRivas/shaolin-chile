require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seedCustomAdmins() {
    let connection;
    try {
        console.log('Conectando al servidor MySQL para crear administradores...');
        connection = await mysql.createConnection({
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'shaolin_chile'
        });

        const admins = [
            { nombre: 'Maxi Muñoz Cretier', email: 'maxi@shaolinchile.cl', rawPass: 'maxi2026' },
            { nombre: 'Benja Muñoz Cretier', email: 'benja@shaolinchile.cl', rawPass: 'benja2026' },
            { nombre: 'Marco Rivas Molina', email: 'marco@shaolinchile.cl', rawPass: 'marco2026' }
        ];

        const rolId = 2; // Administrador
        const saltRounds = 10;

        for (const admin of admins) {
            console.log(`Procesando usuario: ${admin.nombre} (${admin.email})...`);
            const passwordHash = await bcrypt.hash(admin.rawPass, saltRounds);

            const query = `
                INSERT INTO usuarios (nombre, email, password_hash, rol_id)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                nombre = VALUES(nombre), 
                password_hash = VALUES(password_hash), 
                rol_id = VALUES(rol_id)
            `;

            await connection.execute(query, [admin.nombre, admin.email, passwordHash, rolId]);
            console.log(`✅ ${admin.nombre} creado como Administrador.`);
        }

        console.log('¡Todos los administradores fueron creados exitosamente!');

    } catch (error) {
        console.error('Error al crear administradores:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seedCustomAdmins();
