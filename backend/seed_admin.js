// Creates or updates the main administrator account.
// Usage: set SEED_ADMIN_PASSWORD in backend/.env, then `npm run seed:admin`.
require('dotenv').config({ quiet: true });
const { requireEnv, runSeed } = require('./src/seedUser');

let password;
try {
    password = requireEnv(process.env, 'SEED_ADMIN_PASSWORD');
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

runSeed([
    { nombre: 'Admin Principal', email: 'admin@shaolinchile.cl', password, roles: ['Administrador'] },
]);
