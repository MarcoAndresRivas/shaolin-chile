# Cómo trabajar en el repositorio

Estas reglas siguen los lineamientos del [plan maestro](docs/plan-maestro.md).

## Ramas y pull requests

- `main` está protegida: nadie sube cambios directo a `main`.
- Cada cambio va en una rama propia, creada desde `main` actualizado:

  ```sh
  git switch main
  git pull
  git switch -c feat/galeria-instagram
  ```

- Prefijos de rama: `feat/` (funcionalidad nueva), `fix/` (corrección), `chore/` (mantenimiento), `docs/` (documentación).
- El cambio entra a `main` por pull request, con al menos una revisión aprobada.
- Un pull request debe ser pequeño y tratar un solo tema (idealmente menos de 400 líneas cambiadas).

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/):

```text
feat(backend): agregar reserva de clases por sesión
fix(sitio): corregir menú en celulares
docs: actualizar instrucciones de instalación
```

## Antes de abrir el pull request

- `cd backend && npm test` pasa sin errores.
- Si cambiaste el esquema, agregaste una migración nueva y la probaste.
- Si agregaste una variable de entorno, la documentaste en `backend/.env.example`.

## Secretos

- Nunca se suben claves, contraseñas ni archivos `.env`. El `.gitignore` ya los excluye.
- Las contraseñas no se escriben en el código: se leen desde variables de entorno.
- Si una clave llega al repositorio por error, hay que cambiarla de inmediato. Borrar el archivo no alcanza, porque queda en el historial.

## Sesiones de trabajo

El desarrollo se hace en el computador del director, con Claude Code en la carpeta local del proyecto. Cada sesión termina con sus cambios subidos a GitHub en una rama.
