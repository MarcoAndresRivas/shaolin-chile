require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupIntranetDatabase() {
    let connection;
    try {
        console.log('Conectando al servidor MySQL...');
        connection = await mysql.createConnection({
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Usando base de datos shaolin_chile...');
        await connection.query('USE shaolin_chile;');

        console.log('Creando tabla de Roles...');
        const createRolesQuery = `
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE
            )
        `;
        await connection.query(createRolesQuery);

        console.log('Insertando Roles iniciales...');
        const insertRolesQuery = `
            INSERT IGNORE INTO roles (id, nombre) VALUES 
            (1, 'Desarrollador'),
            (2, 'Administrador'),
            (3, 'Colaborador'),
            (4, 'Externo'),
            (5, 'Alumno')
        `;
        await connection.query(insertRolesQuery);

        console.log('Creando tabla de Usuarios...');
        const createUsuariosQuery = `
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                rol_id INT NOT NULL,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rol_id) REFERENCES roles(id)
            )
        `;
        await connection.query(createUsuariosQuery);

        console.log('Creando tabla de Alumnos Detalles...');
        const createAlumnosInfoQuery = `
            CREATE TABLE IF NOT EXISTS detalles_alumno (
                usuario_id INT PRIMARY KEY,
                ano_ingreso YEAR,
                fecha_nacimiento DATE,
                telefono VARCHAR(50),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `;
        await connection.query(createAlumnosInfoQuery);

        console.log('Creando tabla de Horarios (Clases)...');
        const createHorariosQuery = `
            CREATE TABLE IF NOT EXISTS horarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                dia_semana ENUM('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo') NOT NULL,
                hora_inicio TIME NOT NULL,
                hora_fin TIME NOT NULL,
                creador_id INT NOT NULL,
                cupo_maximo INT DEFAULT 20,
                FOREIGN KEY (creador_id) REFERENCES usuarios(id)
            )
        `;
        await connection.query(createHorariosQuery);

        console.log('Creando tabla de Reservas/Asignaciones...');
        const createReservasQuery = `
            CREATE TABLE IF NOT EXISTS reservas_alumno (
                alumno_id INT NOT NULL,
                horario_id INT NOT NULL,
                estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo',
                fecha_reserva DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (alumno_id, horario_id),
                FOREIGN KEY (alumno_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (horario_id) REFERENCES horarios(id) ON DELETE CASCADE
            )
        `;
        await connection.query(createReservasQuery);

        console.log('¡Tablas de la Intranet creadas exitosamente!');

    } catch (error) {
        console.error('Error al configurar la base de datos de Intranet:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexión cerrada.');
        }
    }
}

setupIntranetDatabase();
