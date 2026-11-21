# Exámenes y grados con el sistema Duan Pin

Objective: model grades and exams on the official Shaolin Temple Duan Pin system (段品制), with each level's content defined by the school's head instructor.
Branch: `feat/duan-pin` (from `main`). Delivery strategy: ask-on-risk (stacked PRs to main, as accepted for the store). Test runner: `node --test` in `backend/` and `web/`.

## Specs

- S1 — "investiga sobre como son las evaluaciones en shaolin, y esa estructura es la que debemos copiar en nuestra escuela, me refiero a la parte de examenes y grados" and "Sistema Oficial del Templo Shaolin (Duan Pin)": grades follow the Duan Pin ladder: Duan 1–9 in three stages (inicial 1–3, media 4–6, alta 7–9), then Pin 1–9 with three grades each (27 steps). No level can be skipped.
- S2 — "las define el instructor principal de la escuela": the head instructor (administration) defines and edits each level's content in the portal: forms, techniques, and the school's own requirements (minimum classes and months).
- S3 — From the research (sources in the Log): minimum age 7 for Duan 1–3, 10 for Duan 4–6, 13 for Duan 7–9; Pin needs age 16 and at least 12 months with Duan 9.
- S4 — From the research: an exam has three parts, passed separately: conduct and precepts (习武戒约), theory, and technique; Pin adds real combat. Assumptions (official scoring not confirmed): theory is scored 0–100 and is required from Duan 4 and in every Pin; technique is scored 0–10; the jury (evaluators) is recorded. A pass needs conduct accepted and every required part scored.
- S5 — Assumption: the ladder is loaded for Kung Fu Tradicional by an explicit command, only when that discipline has no grades yet; honorary Pin ranks are not examined and are not loaded.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3, S4 | inline | done | RED 6/6 → GREEN 7/7 (plus birth date endpoint); existing exam tests send the three parts; rollback test; backend 204/204; Risk items 1 (migration) and 3 (results API now requires the parts to pass; only consumer is the portal, updated in T3) → verifier at feature end |
| T2 | S1, S3, S5 | inline | done | RED → GREEN 2/2; backend suite below |
| T3 | S2, S4 | inline | pending | |

- T1: backend: grade columns (serie, nivel, etapa, grado de Pin, edad mínima, formas, teoría y combate requeridos); exam result columns (conducta, nota técnica, nota teórica, combate, evaluadores, observaciones); editing a grade; age in eligibility; results with the three parts.
- T2: `npm run seed:duanpin` loads the 36 levels for Kung Fu Tradicional.
- T3: portal: grades by stage with content editing; exam results with the three parts and jury; student progress with stage, age requirement and what to study.

Route evidence: no Writer trigger (no parallel units, no context backstop); every task inline.

## Log

- L1 (2026-11-21): "mira, investiga sobre como son las evaluaciones en shaolin, y esa estructura es la que debemos copiar en nuestra escuela, me refiero a la parte de examenes y grados, ademas cuando ingreso a Admin esta la seccion interesados, no se que es eso, revisa si es necesario y/o por que esta y cual es su funcion"
- L2 (2026-11-21): "Sistema Oficial del Templo Shaolin (Duan Pin)"
- L3 (2026-11-21): asked whether the forms per Duan come from the head instructor or an official syllabus; answer: "las define el instructor principal de la escuela".
- L4: research. Official: Shi Yongxin, "少林功夫段品制100问" (https://www.toutiao.com/w/1682204533896205/): Duan 1–9 in 初/中/高段位, Pin 1–9; Pin names 拳士 (1–3), 拳师 (4–6), 名师, 大师, 宗师. China News 2020 (https://www.chinanews.com.cn/cul/2020/01-09/9055456.shtml): ages 7/10/13, Pin 16+ and one year after Duan 9, theory from Duan 4, staff from Duan 7, combat for Pin; certificate, insignia, belt and uniform per level; exam by the Temple's Duan Pin committee. Technique progression strike, kick (2), lock (4), body strike (5), throw (7). Not confirmed by an official source: scoring scale, pass marks, time between levels, forms per level. The official technical page blocks automated reads.
- L5: current module (explorer map): grades per discipline with no data, eligibility by attended classes and months, exam with date and fee, result aprobado/reprobado/ausente, free-text techniques; no editing of grades; usuarios already stores fecha_nacimiento.
- L6 (T1): the date of birth is stored in detalles_alumno, which no screen could set; added PUT /alumnos/:id/fecha-nacimiento (administration) so minimum ages can be checked.
