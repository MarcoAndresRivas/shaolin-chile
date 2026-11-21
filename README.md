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
   npm run seed:ofertas
   ```

   `seed:ofertas` crea el primer seminario (4 y 5 de diciembre, $35.000 por día, los dos días por $59.000) y un curso de prueba. Los datos de transferencia que se muestran al comprar se configuran con las variables `PAGO_*` de `.env` (ver `backend/.env.example`).

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

- **Backend:** contenedor construido con `backend/Dockerfile` (contexto `backend/`), alojado en Northflank con su base MySQL. Variables obligatorias: `DB_CLIENT=mysql`, `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `JWT_SECRET` y `CORS_ORIGINS`.
- **Al arrancar**, `backend/scripts/start.sh` aplica las migraciones pendientes. Con `SEED_DEMO=true` además carga los datos de demostración (seminario, curso, productos, escala Duan Pin, un admin y un alumno, con `SEED_ADMIN_PASSWORD` y `SEED_ALUMNO_PASSWORD`); se puede repetir sin duplicar nada. Quitar `SEED_DEMO` cuando el sitio pase a ser real.
- **Sitio oficial:** Vercel (https://shaolin-chile.vercel.app). `vercel.json` hace que Vercel pruebe y compile `web/` y publique solo `web/dist`, en la raíz del dominio. Se actualiza con cada cambio en `main`.
- **Copia en GitHub Pages:** https://marcoandresrivas.github.io/shaolin-chile/. `.github/workflows/deploy-web.yml` la publica cada vez que cambia `web/` en `main`.
- El origen de cada sitio debe estar en `CORS_ORIGINS` del backend; si falta, el formulario, el portal y el chat no pueden llamar a la API desde ese dominio.

## API del asistente virtual

El asistente (n8n) llama a `/api/asistente` con la clave compartida en el encabezado `X-Asistente-Key`. La clave se define en la variable `ASISTENTE_API_KEY` del backend (mínimo 32 caracteres; se genera igual que `JWT_SECRET`). Sin esa variable, estas rutas responden 503.

| Ruta | Para qué |
| --- | --- |
| `GET /api/asistente/sesiones` | Próximas sesiones programadas: fecha, horario, sede y disciplina |
| `POST /api/asistente/interesados` | Registra a la persona; mismos campos que `POST /api/interesados`, con `origen` `sitio`, `instagram` o `whatsapp` y `consentimiento: true` |
| `POST /api/asistente/interesados/:id/clase-prueba` | Agenda la clase de prueba: `{ "sesion_id": 12 }` |
| `POST /api/asistente/conversaciones` | Guarda mensajes: `{ "canal": "sitio", "chat_id": "...", "interesado_id": 3, "mensajes": [{ "rol": "persona", "texto": "..." }] }`. `interesado_id` es opcional; al enviarlo, los mensajes anteriores del mismo chat quedan vinculados a esa persona |

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Chat de la página

El sitio muestra un chat con el asistente virtual en todas las páginas. Llama a `POST /api/chat` con `{ "mensaje": "...", "chat_id": "..." }` (`chat_id` es opcional y lo entrega la primera respuesta) y recibe `{ "chat_id", "respuesta" }`. Límite: 30 mensajes cada 10 minutos por visitante.

El chat se enciende cuando el backend tiene `ASISTENTE_API_KEY` y un modelo de IA configurado. Sin eso responde 503 y el sitio ofrece WhatsApp.

| Variable | Para qué |
| --- | --- |
| `ASISTENTE_MODELO_URL` | Dirección del proveedor, en formato OpenAI. Ollama local: `http://localhost:11434/v1` |
| `ASISTENTE_MODELO` | Nombre del modelo, por ejemplo `qwen3.5:latest` |
| `ASISTENTE_MODELO_KEY` | Clave del proveedor (Ollama local no la necesita) |
| `ASISTENTE_MODELO_RAZONAMIENTO` | Opcional. `none` hace que los modelos con razonamiento respondan más rápido |

Cambiar de proveedor (Ollama, Gemini, OpenRouter, Groq) es cambiar estas variables, no el código. La conversación se guarda solo después de que la persona autoriza guardar sus datos; las conversaciones en curso viven en la memoria del servidor y se pierden al reiniciarlo.

Para probarlo en local, el origen del sitio de desarrollo (`http://localhost:4321`) debe estar en `CORS_ORIGINS`.

Para probar el asistente por WhatsApp con un número aparte, ver `asistente-whatsapp/README.md`.
