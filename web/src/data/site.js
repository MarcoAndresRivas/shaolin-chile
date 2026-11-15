// Official site content.
// Source: Jose Cuevas' content panel (shaolinguan.cl), from screenshots
// in capturas/ taken on 2026-11-13.
// Fields Jose has not provided yet are left as null and the UI hides them
// or shows "Por confirmar". Never fill them with invented data.

// Public brand vs legal entity. The legal name is shown only once the club
// is actually constituted, so the site never claims a status it does not have.
export const brand = {
  name: 'Shaolin Chile',
  legalName: 'Club Deportivo Shaolin Guan Chile',
  legalBasis: 'Ley N° 19.712 del Deporte',
  constituted: true,
};

export const contact = {
  city: 'Concepción, Chile',
  whatsapp: '56986157545',
  whatsappLabel: '+56 9 8615 7545',
  email: 'info@shaolinguan.cl',
  instagram: 'https://www.instagram.com/shaolinguanchile/',
  instagramHandle: '@shaolinguanchile',
};

export const hero = {
  eyebrow: 'Tradición & Disciplina en Chile',
  titleLine1: 'Domina tu cuerpo',
  titleLine2: 'y tu mente',
  description:
    'Descubre el poder del auténtico Kung Fu. Entrenamiento físico y mental para todas las edades.',
  primaryCta: 'Comienza tu viaje',
  secondaryCta: 'Ver disciplinas',
};

export const history = {
  eyebrow: 'Nuestra Filosofía y Linaje',
  title: 'El Camino del Shaolin en Chile',
  highlights: [
    'Instructores avalados a nivel internacional',
    'Conexión directa con China y la sede central en Argentina',
    'Múltiples sedes a lo largo de Chile',
    'Clases adaptadas para todas las edades y niveles',
  ],
  paragraphs: [
    'Formamos parte de una prestigiosa Asociación Internacional de Kung Fu, con conexión directa a China y sede central para toda Latinoamérica ubicada en Argentina. Somos los representantes oficiales encargados de preservar y transmitir el aprendizaje tradicional de las artes marciales chinas.',
    'Nuestro objetivo principal es forjar el carácter, la disciplina y mejorar integralmente la salud física y mental de nuestros alumnos bajo estándares internacionales. Ya sea que busques dominar técnicas de defensa personal o encontrar un equilibrio interior, nuestro linaje de maestros te guiará paso a paso.',
  ],
};

export const disciplinesHead = { eyebrow: 'Nuestras Artes', title: 'Disciplinas Impartidas' };

export const disciplinesIntro =
  'Ofrecemos un currículo completo que abarca diferentes aspectos del sistema marcial chino antiguo adaptado a las necesidades modernas.';

export const disciplines = [
  {
    slug: 'kung-fu-tradicional',
    name: 'Kung Fu Tradicional',
    image: 'CABV5wqpxzD',
    description:
      'El núcleo de nuestra escuela. Aprende las formas tradicionales (Taolu), técnicas de mano vacía y el uso de armas clásicas chinas, desarrollando fuerza explosiva y coordinación.',
  },
  {
    slug: 'sanda',
    name: 'Sanda (Boxeo Chino)',
    image: 'B-7ePjpJ3oS',
    description:
      'El aspecto deportivo y de combate libre. Combinación letal de golpes, patadas y proyecciones. Ideal para defensa personal y acondicionamiento intenso.',
  },
  {
    slug: 'tai-chi-qi-gong',
    name: 'Tai Chi y Qi Gong',
    image: 'C2XhXYiO011',
    description:
      'Cultiva tu energía interna (Qi). Los movimientos suaves y fluidos fortalecen las articulaciones, alivian el estrés y mejoran enormemente la conexión mente-cuerpo.',
  },
  {
    slug: 'cursos-online',
    name: 'Cursos Online',
    image: 'DfSMGdxhmQx',
    description:
      'Aprende desde cualquier lugar. Programas estructurados y seguimiento personalizado para que domines las bases del Kung Fu y Tai Chi a tu propio ritmo.',
  },
];

export const benefitsHead = { eyebrow: 'Tu Entrenamiento', title: 'Beneficios de la Práctica' };

export const benefitsIntro =
  'Más que un deporte: una formación integral respaldada por la tradición marcial china.';

// Titles come from the panel screenshots; texts from the earlier panel read,
// in the same order.
export const benefits = [
  { title: 'Salud física y mental', text: 'Mejora integral de tu condición bajo estándares internacionales.' },
  { title: 'Defensa personal', text: 'Técnicas reales de combate y defensa, desde las bases.' },
  { title: 'Disciplina y foco', text: 'Forja el carácter y fortalece la concentración y la mente.' },
  { title: 'Comunidad', text: 'Una gran familia marcial con presencia nacional e internacional.' },
  { title: 'Todas las edades', text: 'Clases adaptadas para niños, jóvenes y adultos, sin experiencia previa.' },
  { title: 'Equilibrio interior', text: 'Energía, coordinación y conexión mente-cuerpo mediante el Qi Gong.' },
];

export const locationsHead = { eyebrow: 'Presentes en Todo el País', title: 'Nuestras Sedes en Chile' };

// Street addresses are still pending from Jose: keep them null.
export const locations = [
  {
    name: 'Sede Administrativa Nacional',
    city: 'Concepción',
    address: null,
    description: 'Centro neurálgico de nuestras operaciones y formación continua en el país.',
  },
  {
    name: 'Sede Región Metropolitana',
    city: 'Santiago Centro',
    address: null,
    description: 'Acercando el arte marcial tradicional a la capital del país.',
  },
  {
    name: 'Sede Región del Maule',
    city: 'Talca',
    address: null,
    description: 'Escuela dedicada a la formación integral de niños, jóvenes y adultos.',
  },
];

// The panel lists these schedules without assigning them to a location.
export const schedules = [
  { days: 'Lunes, Miércoles y Viernes', time: '19:00 – 20:30', discipline: 'Kung Fu Tradicional' },
  { days: 'Martes y Jueves', time: '18:30 – 20:00', discipline: 'Sanda' },
  { days: 'Sábados', time: '10:00 – 11:30', discipline: 'Tai Chi' },
];

export const instructorsHead = { eyebrow: 'Nuestro Equipo', title: 'Instructores' };

// Profiles 2 and 3 are empty in Jose's panel ("leave a profile empty so it is
// not published"), so only profile 1 is shown. Cargo comes from the master plan.
export const instructors = [
  {
    name: 'Laoshi José Cuevas B.',
    role: 'Instructor principal',
    rank: null,
    specialty: null,
    bio: null,
    image: null,
  },
];

export const gallery = [
  { id: 'CABV5wqpxzD', kind: 'p', alt: 'Alumnos de la escuela en posturas de Kung Fu dentro de la sala de entrenamiento' },
  { id: 'DfhxBOIhGVE', kind: 'reel', alt: 'Dos practicantes en postura baja al aire libre' },
  { id: 'DffiTKThy_M', kind: 'reel', alt: 'Instructor ejecutando una forma de Kung Fu en el campo' },
  { id: 'DfSMGdxhmQx', kind: 'reel', alt: 'Entrenamiento de postura con bastones al aire libre' },
  { id: 'C2XhXYiO011', kind: 'reel', alt: 'Práctica de Tai Chi al sol' },
  { id: 'B-7ePjpJ3oS', kind: 'p', alt: 'Alumnos practicando técnicas en parejas en el bosque' },
  { id: 'Bppn2h8lX4g', kind: 'p', alt: 'Practicante junto a un monje con túnica naranja' },
];

export const galleryHead = { title: 'Galería', intro: 'Momentos de entrenamiento en nuestra escuela.' };

export const cta = {
  title: '¿Listo para comenzar tu entrenamiento?',
  button: 'Solicita tu clase de prueba',
  description:
    'Visítanos en nuestra sede. Estamos listos para recibirte sin importar tu nivel de experiencia previa.',
};

export const footer = {
  description:
    'Preservando el legado del Kung Fu tradicional combinando técnicas milenarias con metodologías modernas.',
  copyright: 'Shaolin Chile — Escuela de Artes Marciales Chinas. Todos los derechos reservados.',
};
