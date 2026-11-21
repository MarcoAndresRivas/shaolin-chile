// The products of the store, bought from Imperio Marcial. They ship to the whole
// country; the ones marked sugerido_seminario can also be picked up at the
// December seminar until the presale closes. Prices are the suggested sale prices (supplier price
// plus the shipping the buyer saves); stock values are estimates to confirm
// with the supplier. Items that are out of stock there (sold only by order,
// 2 to 4 months) start as drafts. Photos live in web/public/ofertas.
// Safe to repeat: a product that already exists (same title) is left as it is.

const CIERRE = '2026-11-27'; // presale closes the Friday before the seminar

const PRODUCTOS = [
    {
        titulo: 'Zapatillas Feiyue',
        descripcion: 'Zapatilla Feiyue unisex, liviana y flexible, con suela de goma, para wushu y kung fu. Elige un número más que tu talla chilena.',
        imagen: 'feiyue.webp',
        sugerido_seminario: true,
        precio: 25990,
        tallas: ['35', '36', '37', '38', '39', '40', '41', '43'].map((talla) => [talla, 3]),
    },
    {
        titulo: 'Bastón de ratán 1,8 m',
        descripcion: 'Bastón largo de ratán flexible (1,8 m × 2,2 cm) para formas de bastón de wushu y kung fu.',
        imagen: 'baston-ratan.webp',
        sugerido_seminario: true,
        precio: 24990,
        tallas: [['Única', 10]],
    },
    {
        titulo: 'Guantes foco Mitt',
        descripcion: 'Foco curvo de PU con espuma de alta densidad, para boxeo, sanda, MMA y muay thai.',
        imagen: 'guantes-foco.webp',
        sugerido_seminario: true,
        precio: 16990,
        tallas: [['Rojo', 5], ['Azul', 5]],
    },
    {
        titulo: 'Paletas dobles para patear (par)',
        descripcion: 'Par de paletas dobles de espuma resistente y cuerina sintética para practicar patadas.',
        imagen: 'paletas-dobles.webp',
        sugerido_seminario: true,
        precio: 22990,
        tallas: [['Única', 5]],
    },
    {
        titulo: 'Escudo curvo ThaiPad',
        descripcion: 'Escudo curvo tipo thai pad para patadas y golpes en sanda, boxeo y kickboxing.',
        imagen: 'escudo-thaipad.webp',
        precio: 22990,
        tallas: [['Única', 1]],
    },
    {
        titulo: 'Chaleco Shaolin',
        descripcion: 'Chaleco tradicional Shaolin para entrenar kung fu.',
        imagen: 'chaleco-shaolin.webp',
        precio: 22990,
        tallas: [['Única', 1]],
    },
    {
        titulo: 'Espada Jian de entrenamiento',
        descripcion: 'Espada jian semirrígida con vaina y borla. Por encargo: llega en 2 a 4 meses.',
        imagen: 'espada-jian.webp',
        precio: 68990,
        tallas: ['60 cm', '65 cm', '70 cm', '75 cm', '80 cm'].map((talla) => [talla, 0]),
        estado: 'borrador',
    },
    {
        titulo: 'Kwandao desmontable 1,85 m',
        descripcion: 'Kwandao desmontable con hoja semirrígida y estuche. Por encargo: llega en 2 a 4 meses.',
        imagen: 'kwandao.webp',
        precio: 123990,
        tallas: [['Única', 0]],
        estado: 'borrador',
    },
];

async function seedProductos(knex) {
    const created = [];
    for (const { tallas, estado = 'publicado', ...producto } of PRODUCTOS) {
        if (await knex('productos').where({ titulo: producto.titulo }).first()) continue;
        const [inserted] = await knex('productos').insert({ ...producto, cierre_preventa: CIERRE, estado });
        const id = typeof inserted === 'object' ? inserted.id : inserted;
        await knex('producto_tallas').insert(tallas.map(([talla, stock]) => ({ producto_id: id, talla, stock })));
        created.push(producto.titulo);
    }
    return created;
}

module.exports = { seedProductos, PRODUCTOS };
