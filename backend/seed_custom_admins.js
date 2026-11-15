// Creates or updates the team's administrator accounts.
// Usage: set SEED_MAXI_PASSWORD, SEED_BENJA_PASSWORD and SEED_MARCO_PASSWORD
// in backend/.env, then `npm run seed:team`.
require('dotenv').config({ quiet: true });
const { requireEnv, runSeed } = require('./src/seedUser');

const TEAM = [
    { nombre: 'Maxi Muñoz Cretier', email: 'maxi@shaolinchile.cl', passwordVar: 'SEED_MAXI_PASSWORD' },
    { nombre: 'Benja Muñoz Cretier', email: 'benja@shaolinchile.cl', passwordVar: 'SEED_BENJA_PASSWORD' },
    { nombre: 'Marco Rivas Molina', email: 'marco@shaolinchile.cl', passwordVar: 'SEED_MARCO_PASSWORD' },
];

let users;
try {
    users = TEAM.map(({ passwordVar, ...user }) => ({
        ...user,
        password: requireEnv(process.env, passwordVar),
        roles: ['Administrador'],
    }));
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

runSeed(users);
