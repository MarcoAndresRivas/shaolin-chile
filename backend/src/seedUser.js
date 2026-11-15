const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

// Returns env[name], or throws when it is missing, so no seed ever falls back
// to a password written in the code.
function requireEnv(env, name) {
    const value = env[name];
    if (!value || !value.trim()) {
        throw new Error(`${name} is not set. Add it to backend/.env before running this seed.`);
    }
    return value;
}

// Creates the user, or updates name and password when the email already
// exists, and grants every role in `roles` (by name). Existing roles are kept.
// Returns the user id.
async function upsertUser(knex, { nombre, email, password, roles: requestedRoles }) {
    if (!requestedRoles || requestedRoles.length === 0) throw new Error(`No roles given for ${email}.`);
    const roles = [...new Set(requestedRoles)];

    const roleRows = await knex('roles').whereIn('nombre', roles).select('id', 'nombre');
    const idsByName = Object.fromEntries(roleRows.map((r) => [r.nombre, r.id]));
    const unknown = roles.filter((name) => !(name in idsByName));
    if (unknown.length) throw new Error(`Unknown role(s): ${unknown.join(', ')}. Run the migrations first.`);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // usuarios.rol_id is the legacy single role, still read by the current frontend.
    const legacyRolId = idsByName[roles[0]];

    return knex.transaction(async (trx) => {
        const existing = await trx('usuarios').where({ email }).first('id');
        let userId;
        if (existing) {
            userId = existing.id;
            await trx('usuarios').where({ id: userId }).update({ nombre, password_hash: passwordHash, rol_id: legacyRolId });
        } else {
            [userId] = await trx('usuarios').insert({ nombre, email, password_hash: passwordHash, rol_id: legacyRolId });
        }

        const current = new Set(await trx('usuario_roles').where({ usuario_id: userId }).pluck('rol_id'));
        const toAdd = roles.map((name) => idsByName[name]).filter((id) => !current.has(id));
        if (toAdd.length) {
            await trx('usuario_roles').insert(toAdd.map((rolId) => ({ usuario_id: userId, rol_id: rolId })));
        }
        return userId;
    });
}

// Shared entry point for the seed scripts: connects with knexfile.js,
// upserts each user, and exits with code 1 on any error.
async function runSeed(users) {
    const knex = require('knex')(require('../knexfile'));
    try {
        for (const user of users) {
            await upsertUser(knex, user);
            console.log(`Seeded ${user.email} (${user.roles.join(', ')}).`);
        }
    } catch (error) {
        console.error(`Seed failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
}

module.exports = { requireEnv, upsertUser, runSeed };
