-- Script para inicializar la base de datos de Shaolin Chile en MySQL
-- Debes ejecutar este script en tu servidor MySQL (por ejemplo, PHPMyAdmin o DBeaver)

CREATE DATABASE IF NOT EXISTS shaolin_chile;
USE shaolin_chile;

CREATE TABLE IF NOT EXISTS representantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    sede VARCHAR(255) NOT NULL,
    mensaje TEXT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);
