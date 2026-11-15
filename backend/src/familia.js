// Family relations shared by the controllers.

// True when `guardianId` is an apoderado of a family in which `studentId` is an alumno.
async function isGuardianOf(db, guardianId, studentId) {
    const [rows] = await db.execute(
        `SELECT 1 AS ok
         FROM familia_miembros g
         JOIN familia_miembros a ON a.familia_id = g.familia_id
         WHERE g.usuario_id = ? AND g.rol_en_familia = 'apoderado'
           AND a.usuario_id = ? AND a.rol_en_familia = 'alumno'`,
        [guardianId, studentId],
    );
    return rows.length > 0;
}

module.exports = { isGuardianOf };
