# Sitio web — Shaolin Chile

Sitio institucional nuevo (Fase 1 del plan maestro), construido con [Astro](https://astro.build) y React. Genera HTML estático que se publica en GitHub Pages y consume la API de `backend/`.

## Requisitos

- Node.js 22.23.4 o superior.

## Uso

```bash
cd web
npm install
npm run dev       # servidor de desarrollo en http://localhost:4321/shaolin-chile/
npm test          # tests de la lógica (node --test)
npm run build     # genera el sitio en web/dist
npm run preview   # sirve web/dist para revisarlo
```

El sitio se publica bajo `/shaolin-chile/`. Para otro dominio, compilar con `BASE_PATH=/` y `SITE_URL=https://<dominio>`.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/data/site.js` | Todo el texto del sitio. Fuente oficial: panel de contenido de José Cuevas. |
| `src/assets/instagram/` | Fotos de @shaolinguanchile, nombradas por el id de la publicación. |
| `src/pages/` | Páginas: inicio e instructores. |
| `src/components/` | Encabezado, pie y formulario de clase de prueba (isla React). |
| `src/lib/` | Lógica sin interfaz, con tests en `test/`. |

## Reglas de contenido

- No se publica información inventada. Los datos que José todavía no entrega (direcciones, horarios, biografías) quedan en `null` y el sitio muestra "Por confirmar".
- Para cambiar un texto se edita `src/data/site.js`. Más adelante, el módulo de contenido lo hará desde el panel de administración.
- Para agregar una foto de Instagram: guardar `src/assets/instagram/<id>.jpg` y sumarla a `gallery` en `src/data/site.js`.

## Portal (ingreso)

`/ingresar/` y `/portal/` usan la API de `backend/`: el alumno ve las clases, reserva y revisa sus reservas; la administración (Director, Administrador, Desarrollador) crea y elimina clases y ve los usuarios. Otros roles ven un aviso hasta la Fase 2.

La URL de la API es `PUBLIC_API_URL` si está definida; si no, `http://localhost:3000` en local y el backend de Render en producción. Para probarlo en local, el backend debe aceptar el origen del sitio:

```bash
cd backend
DB_CLIENT=sqlite JWT_SECRET=dev-secret CORS_ORIGINS=http://localhost:4321 npm start
```

## Clase de prueba

Hasta que exista el registro de interesados en la API (Fase 2), el formulario valida los datos y abre WhatsApp con el mensaje armado hacia el número oficial.
