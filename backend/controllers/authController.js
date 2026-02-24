const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const db = req.db;

    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan credenciales.' });
    }

    try {
        const query = 'SELECT * FROM usuarios WHERE email = ?';
        const [rows] = await db.execute(query, [email]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = rows[0];

        // Comparar contraseña hasheada
        const match = await bcrypt.compare(password, usuario.password_hash);

        if (!match) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Generar JWT
        const token = jwt.sign(
            { id: usuario.id, rol_id: usuario.rol_id },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            rol_id: usuario.rol_id,
            nombre: usuario.nombre
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

exports.register = async (req, res) => {
    const { repName, repEmail, repSede, repMessage } = req.body;
    const db = req.db;

    if (!repName || !repEmail || !repSede) {
        return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    try {
        // 1. Guardar en base de datos MySQL
        const insertQuery = `INSERT INTO representantes (nombre, email, sede, mensaje) VALUES (?, ?, ?, ?)`;
        const [result] = await db.execute(insertQuery, [repName, repEmail, repSede, repMessage]);

        console.log(`Representative registered with ID: ${result.insertId}`);

        // 2. Enviar correo de confirmación (Opcional, se ejecuta asíncronamente)
        enviarCorreoConfirmacion(repName, repEmail, repSede);

        res.status(201).json({
            success: true,
            message: 'Registro exitoso. Te enviaremos un correo de confirmación pronto.'
        });

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

async function enviarCorreoConfirmacion(nombre, email, sede) {
    try {
        // Configuramos el transporter de Nodemailer con Ethereal Email (para pruebas locales)
        // En producción, se usarían las variables de entorno (.env) para SMTP real (Gmail, SendGrid, etc.)
        const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
        const port = process.env.SMTP_PORT || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        if (!user || !pass) {
            console.warn("Nodemailer: Credentials not found in .env, skipping email sending for now.");
            return;
        }

        const transporter = nodemailer.createTransport({
            host: host,
            port: port,
            auth: {
                user: user,
                pass: pass
            }
        });

        const mailOptions = {
            from: '"Shaolin Chile Admin" <admin@shaolinchile.cl>',
            to: email,
            subject: 'Confirmación de Registro - Shaolin Chile',
            html: `
                <h2>Hola ${nombre},</h2>
                <p>Hemos recibido tu solicitud de registro como representante de la sede <strong>${sede}</strong>.</p>
                <p>Actualmente tu solicitud está en proceso de revisión por la Administración Nacional.</p>
                <br>
                <p>Saludos cordiales,</p>
                <p><strong>Escuela de Kung Fu Shaolin Sede Chile</strong></p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent: %s", info.messageId);

    } catch (err) {
        console.error("Error sending email:", err);
    }
}
