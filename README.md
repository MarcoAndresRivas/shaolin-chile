# Shaolin Chile

Plataforma web de la Asociación Internacional de Kung Fu, sede Chile: sitio institucional, intranet de alumnos y administración. La hoja de ruta completa está en el [plan maestro](docs/plan-maestro.md).

## Estructura

| Carpeta / archivo | Qué contiene |
| --- | --- |
| `index.html`, `css/`, `js/` | Sitio público (GitHub Pages) |
| `admin-dashboard.html`, `alumno-dashboard.html` | Paneles de la intranet |
| `backend/` | API Node.js + Express + MySQL (Render) |
| `backend/migrations/` | Cambios de esquema de la base de datos (Knex) |
| `odd/tasks/` | Registro de tareas por fase |

## Backend en local

Requisitos: Node.js 18 o superior. No hace falta instalar MySQL: en local la API usa un archivo SQLite (`backend/data/shaolin.db`, excluido del repositorio).

1. Instalar dependencias:

   ```sh
   cd backend
   npm install
   ```

2. Copiar `backend/.env.example` a `backend/.env` y completar los valores. `JWT_SECRET` es obligatorio: sin él el servidor no arranca. Para generarlo:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. Elegir la base de datos en `.env`:
   - **SQLite (local, recomendado por ahora):** `DB_CLIENT=sqlite` y `DB_SERVER` vacío. El archivo se crea solo.
   - **MySQL (producción, Aiven):** `DB_CLIENT=mysql` y los valores `DB_*`. La base vacía se crea antes, una sola vez: `CREATE DATABASE shaolin_chile CHARACTER SET utf8mb4;`

4. Crear o actualizar las tablas:

   ```sh
   npm run migrate
   ```

5. Crear usuarios iniciales. Cada script exige su contraseña en `.env` (`SEED_ADMIN_PASSWORD`, `SEED_ALUMNO_PASSWORD`, `SEED_MAXI_PASSWORD`, `SEED_BENJA_PASSWORD`, `SEED_MARCO_PASSWORD`):

   ```sh
   npm run seed:admin
   npm run seed:alumno
   npm run seed:team
   ```

6. Levantar la API en `http://localhost:3000`:

   ```sh
   npm start
   ```

El sitio se abre con un servidor estático (por ejemplo, Live Server en el puerto 5500). Cuando el navegador está en `localhost`, el frontend llama a la API local. Ese origen debe estar en `CORS_ORIGINS`.

## Pruebas

```sh
cd backend
npm test
```

Las pruebas usan SQLite (en memoria y en un archivo temporal), así que no necesitan MySQL. Incluyen un recorrido completo por la API: migraciones, login, horarios y reservas.

## Base de datos y migraciones

- Todo cambio de esquema se hace con una migración nueva en `backend/migrations/`. No se editan tablas a mano.
- `npm run migrate:status` muestra qué migraciones faltan.
- La migración base (`20261113000001_baseline.js`) solo crea las tablas que no existen, así que es segura sobre la base de producción actual.
- `npm run migrate:rollback` se niega a deshacer la migración de roles si hay consentimientos o familias registradas.

## Despliegue

- **Backend:** Render, según `render.yaml`. Variables obligatorias: `DB_*`, `JWT_SECRET` y `CORS_ORIGINS`.
- **Orden al desplegar un cambio de esquema:** primero `npm run migrate` contra la base de producción, después desplegar el backend.
- **Sitio:** GitHub Pages, desde la rama `gh-pages`.

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md).
