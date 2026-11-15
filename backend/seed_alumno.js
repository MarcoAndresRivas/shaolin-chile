// Creates or updates the test student account.
// Usage: set SEED_ALUMNO_PASSWORD in backend/.env, then `npm run seed:alumno`.
require('dotenv').config({ quiet: true });
const { requireEnv, runSeed } = require('./src/seedUser');

let password;
try {
    password = requireEnv(process.env, 'SEED_ALUMNO_PASSWORD');
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

runSeed([
    { nombre: 'Alumno de Prueba', email: 'alumno@shaolinchile.cl', password, roles: ['Alumno'] },
]);
