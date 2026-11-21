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
    {
        titulo: 'Traje de Tai Chi',
        descripcion: 'Traje de tai chi, también usado en kung fu tradicional.',
        imagen: 'traje-taichi.webp',
        precio: 47990,
        tallas: ['Blanco', 'Negro', 'Azul', 'Gris'].map((color) => [color, 2]),
    },
    {
        titulo: 'Zapatillas de cuero blancas Tai Chi',
        descripcion: 'Zapatillas de cuero blanco con suela de goma para kung fu y tai chi. Elige un número más que tu talla habitual.',
        imagen: 'zapatillas-taichi-blancas.webp',
        precio: 41990,
        tallas: ['38', '39', '40', '41', '42', '43'].map((talla) => [talla, 2]),
    },
    {
        titulo: 'Traje de Nanquan',
        descripcion: 'Traje de kung fu de estilos sureños, con pantalón y faja incluidos.',
        imagen: 'traje-nanquan.webp',
        precio: 38990,
        tallas: ['Rojo 165-175 cm', 'Rojo 175-185 cm', 'Dorado 165-175 cm', 'Dorado 175-185 cm'].map((talla) => [talla, 1]),
    },
    {
        titulo: 'Traje de competencia Changquan',
        descripcion: 'Traje de competencia de wushu moderno (changquan), con pantalón y faja. Para estatura de 160 a 170 cm.',
        imagen: 'traje-changquan.webp',
        precio: 48990,
        tallas: [['160-170 cm', 2]],
    },
    {
        titulo: 'Traje de Sanda',
        descripcion: 'Uniforme de sanda de poliéster y algodón para entrenamiento o competencia, para hombres y mujeres.',
        imagen: 'traje-sanda.webp',
        precio: 28990,
        tallas: ['Rojo', 'Azul'].flatMap((color) => ['170 cm', '180 cm', '190 cm'].map((talla) => [`${color} ${talla}`, 2])),
    },
    {
        titulo: 'Bastón de 3 secciones (San Jie Gun)',
        descripcion: 'Bastón de ratán de tres secciones de 1,65 m para kung fu tradicional.',
        imagen: 'san-jie-gun.webp',
        precio: 53990,
        tallas: [['Única', 1]],
    },
    {
        titulo: 'Doble espada Shuang Jian',
        descripcion: 'Par de espadas jian para entrenamiento de wushu y kung fu, con dos borlas rojas.',
        imagen: 'doble-espada-jian.webp',
        precio: 88990,
        tallas: [['Única', 1]],
    },
    {
        titulo: 'Empeineras Wesing',
        descripcion: 'Protectores de empeine de piel sintética con amortiguación EVA para sanda y kickboxing.',
        imagen: 'empeineras.webp',
        precio: 28990,
        tallas: [['Rojo', 3], ['Azul', 3]],
    },
    {
        titulo: 'Canillera Wesing',
        descripcion: 'Canillera para sanda y kickboxing.',
        imagen: 'canillera.webp',
        precio: 53990,
        tallas: [['L Azul', 1]],
    },
    {
        titulo: 'Doble gancho de entrenamiento',
        descripcion: 'Doble gancho cromado semiflexible de 70 cm con paños blancos. Por encargo.',
        imagen: 'doble-gancho.webp',
        precio: 83990,
        tallas: [['70 cm', 0]],
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
