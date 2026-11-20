// The first seminar and a test course, so the site can sell from day one.
// Prices, dates and hours come from the director; what is still unknown (the
// venue, the course videos) is left empty and shown as "Por confirmar".
// Safe to repeat: an offer that already exists (same title) is left as it is.

const SEMINARIO = {
    titulo: 'Seminario de Kung Fu Shaolin — Diciembre',
    descripcion: 'Entrenamiento de Kung Fu tradicional y Qi Gong con el equipo de Shaolin Chile. Cada día tiene dos bloques: de 09:00 a 12:45 y de 14:45 a 17:00, con dos horas para almorzar entre ambos. Puedes inscribirte en un día o en los dos.',
    sede: null,
    imagen: 'seminario.jpg',
    precio_pack: 59000,
    oferta: 'Oferta: los dos días por $59.000 por persona (ahorras $11.000)',
    estado: 'publicado',
};
const DIAS = [
    { fecha: '2026-12-04', hora_inicio: '09:00', hora_fin: '17:00', precio: 35000, cupo: 50 },
    { fecha: '2026-12-05', hora_inicio: '09:00', hora_fin: '17:00', precio: 35000, cupo: 50 },
];

const CURSO = {
    titulo: 'Curso de prueba: Fundamentos del Kung Fu Shaolin',
    descripcion: 'Curso de prueba para la venta de videos. Al pagar recibes acceso a las clases grabadas, con derecho a descargarlas para tu uso personal.',
    imagen: 'curso.jpg',
    precio: 25000,
    estado: 'publicado',
};
const LECCIONES = [
    'Saludo, posturas y calentamiento',
    'Ba Duan Jin: las ocho piezas del brocado',
    'Golpes y patadas básicas',
    'Primera forma de mano vacía',
];

async function insertId(knex, table, row) {
    const [id] = await knex(table).insert(row);
    return typeof id === 'object' ? id.id : id;
}

async function seedOfertas(knex) {
    const created = [];
    if (!(await knex('seminarios').where({ titulo: SEMINARIO.titulo }).first())) {
        const id = await insertId(knex, 'seminarios', SEMINARIO);
        await knex('seminario_dias').insert(DIAS.map((dia) => ({ ...dia, seminario_id: id })));
        created.push(SEMINARIO.titulo);
    }
    if (!(await knex('cursos').where({ titulo: CURSO.titulo }).first())) {
        const id = await insertId(knex, 'cursos', CURSO);
        await knex('curso_lecciones').insert(LECCIONES.map((titulo, index) => ({ curso_id: id, orden: index + 1, titulo })));
        created.push(CURSO.titulo);
    }
    return created;
}

module.exports = { seedOfertas, SEMINARIO, DIAS, CURSO, LECCIONES };
