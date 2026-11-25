# AGENTS.md — SAGO Minutas

Android app (Kotlin + Jetpack Compose) for field "minutas" (tire-service visit reports), plus a
standalone React/Vite admin dashboard in `app/web`. A Node/TypeScript REST API now exists in
`backend/` and is the source of truth for business data; it is deployed at
`https://sago-api.onrender.com`.

`docs/PLAN_CUMPLIMIENTO_RUBRICA.md` is the overall roadmap and scoring plan — it describes the
**target**, not always the current code. For the current phase, read `docs/FASE_2_PLAN.md`.

**Last verified against the repo:** 2026-11-24 (working branch `CopiaHugo`; check `git log -1` for
the current HEAD, since this file is versioned too).

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| Fase 0 — repo/backlog | Done | `docs/FASE_0_PLAN.md` |
| Fase 1 — API base + Google auth + Swagger + deploy | **Done**, tag `v0.2.0-fase1` on `a98bf` | `docs/FASE_1_PLAN.md`, `docs/API_CONTRACT.md`, `docs/EVIDENCIAS.md` |
| Fase 2 — business API + secure Firestore | **In progress**: WP6 code complete and verified; `migrar:apply`, rules deployment and WP7–WP9 pending | `docs/FASE_2_PLAN.md`, `docs/MODELO_DATOS.md`, `git log --grep='WP6'` |
| Fases 3–7 — Android refactor, offline, extra, web, docs | Not started | `docs/PLAN_CUMPLIMIENTO_RUBRICA.md` |

Only WP6 of `docs/FASE_2_PLAN.md` is implemented: `backend/src/config/storage.ts`,
`firestore.rules`, `storage.rules`, `firebase.json`, `firestore.indexes.json`,
`scripts/migrar-datos.ts` and `docs/MODELO_DATOS.md` now exist. It passed `typecheck`,
`typecheck:scripts`, `build` and 46 tests, and `migrar:dry-run` was executed against real
Firestore on 2026-11-24 (4 usuarios, 2 clientes, 7 minutas; 6 fotos pendientes; 0 escrituras).
**WP7–WP9 are still pending**: there are no minuta/cliente/metrica routers, no 13 new
endpoints and no expanded Swagger/Postman. `migrar:apply` has **not** been executed, so no
data has been changed yet. The rules are prepared locally but **not deployed**; activate
them only at the end of Fase 2 as documented in `docs/MODELO_DATOS.md`. The task-8 deviation
(legacy users have no `uid`/email to assign) is documented there too.

## Build & run — Android

`java` is not on PATH. The Gradle wrapper needs the Android Studio JBR:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

- Toolchain: Gradle 9.3.1, AGP 9.1.1, Kotlin 2.2.10, compileSdk 36.1, minSdk 24, Java 11 bytecode.
- `local.properties` (`sdk.dir`) is machine-specific and gitignored.
- APK: `app/build/outputs/apk/debug/app-debug.apk`.
- Verified on 2026-11-13: `assembleDebug`, `testDebugUnitTest`, `lintDebug`. Android build only warns
  about deprecated `Divider` and `Modifier.menuAnchor()`.

## Build & run — backend / API (`backend/`)

Standalone Node 22 + TypeScript + Express 5 service named `sago-api`. It is **not** a Gradle module.

```powershell
cd backend
npm install                 # node_modules is gitignored and not committed
npm run dev                 # tsx watch src/server.ts
npm run typecheck           # tsc --noEmit
npm run typecheck:scripts   # tsc --noEmit -p tsconfig.scripts.json (scripts/)
npm run build               # tsc -p tsconfig.json -> dist/
npm test                    # vitest run
npm run migrar:dry-run      # tsx scripts/migrar-datos.ts --dry-run (read-only, needs Firebase creds)
```

On Windows with PowerShell execution policy blocking `npm.ps1`, use `npm.cmd` / `npx.cmd`.

- Entry points: `src/server.ts` (listen) and `src/app.ts` (router registration). **Only the WP7 owner
  edits `app.ts`** during Fase 2, to avoid merge conflicts.
- Structure today: `src/config/` (firebase Admin lazy init + `storage.ts` with `getStorage()`,
  `getBucket()` and `nombreBucket()`), `src/middlewares/` (`requiereAuth`, `requiereRol`, error
  handling), `src/auth/`, `src/usuarios/`, `src/routes/`, `src/types/`. WP6 also adds
  `backend/scripts/` (migration) and `backend/tests/datos-seguros.test.ts`.
- `backend/openapi.yaml` is the **single source of truth** for Swagger. `/openapi.json` and `/docs/`
  are generated from it; don't hand-maintain a second copy.
- Tests: `backend/tests/health.test.ts`, `auth.test.ts` and `datos-seguros.test.ts` — 3 files,
  **46 tests passing** as of 2026-11-24, using fake repositories and pure adapter functions
  (no live Firebase in unit tests). They pass from `backend/` and from the repo root via
  `node backend/node_modules/vitest/vitest.mjs run --root backend`.
- Verified 2026-11-24 on `CopiaHugo`: `typecheck`, `typecheck:scripts`, `build` and `npm test`
  (46 tests). `migrar:dry-run` was also executed against real Firebase with
  `GOOGLE_APPLICATION_CREDENTIALS` pointing to the service account outside the repo; it reported
  4 usuarios, 2 clientes, 7 minutas, 6 fotos pendientes, 0 fotos omitidas, 4 usuarios saneados,
  and wrote nothing. Still unverified: `migrar:apply`, compiling the rules with Firebase CLI
  (not installed), the public photo URL in Storage, and the WP6 deployment on Render.
- Deployed on Render as service `sago-api`, connected to branch `CopiaHugo`. WP6 was merged into
  `CopiaHugo` on 2026-11-24; **deployment of WP6 has not been verified yet**. Verified live on
  Fase 1: `/health`, `/docs/`, `/openapi.json`, `401` without token, `400` on invalid body, CORS.
- Credentials come **only** from environment variables (Firebase service account as base64). The real
  service account JSON lives outside the repo. Never add `.env`, IDs, tokens or keys to git.
- WP6 adds optional `FIREBASE_STORAGE_BUCKET`: when empty, `nombreBucket()` uses
  `<FIREBASE_PROJECT_ID>.appspot.com`; set it explicitly for `*.firebasestorage.app` buckets.
  `npm run migrar:apply` requires those credentials and exports a backup to
  `backend/backups/` (gitignored) before writing. **It has not been executed**; see
  `docs/MODELO_DATOS.md`.

## Tests, lint — Android

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat testDebugUnitTest
.\gradlew.bat testDebugUnitTest --tests "com.example.sgominutas.ExampleUnitTest"   # single test
.\gradlew.bat connectedDebugAndroidTest   # requires emulator/device
.\gradlew.bat lintDebug
```

Only the auto-generated `ExampleUnitTest` / `ExampleInstrumentedTest` exist in Android (they assert
`2 + 2 == 4`). There is no CI workflow yet; `.github/` only contains PR and issue templates.

## Web dashboard (`app/web`)

Standalone Vite app — **not** a Gradle module despite living under `app/`. Do not add it to
`settings.gradle.kts`.

```powershell
cd app\web
npm install        # node_modules is gitignored and not committed
npm run dev
npm run lint       # oxlint
npm run build
```

Verified on 2026-11-20: `npm run lint` and `npm run build` pass.

## Current architecture — do not mistake it for the target

Android and web are still **pre-Fase 2/3**: they talk to Firestore directly and have not been migrated
to the API.

- Namespace/applicationId: `com.example.sgominutas`. Source lives in `MainActivity.kt`, `ui/theme/`
  and `uisago/screens/`. There are no ViewModels, repositories, entities, DI or services yet.
- `uisago/screens/loginscreen.kt` declares `package com.example.sgominutas` even though its path is
  `.../uisago/screens/`. It compiles from the declaration; don't copy this pattern.
- All state, validation and Firestore calls sit inside composables (`loginscreen.kt`,
  `minutascreen.kt`). New logic should go behind a ViewModel/repository as described in the plan.
- Auth is inconsistent: `loginscreen.kt` compares plaintext passwords from Firestore
  (`usuarios.contrasena`) and saves the user name in SharedPreferences `SAGO_PREFS`/`usuario_activo`,
  while `MainActivity` picks the start destination from `FirebaseAuth.currentUser`. The custom login
  never signs in to Firebase Auth (the dependency is unused). The **backend** login uses Google ID
  tokens via Firebase Admin and ignores that plaintext field.
- The camera bitmap in `minutascreen.kt` stays in memory and is never uploaded or persisted.
- Photo capture uses `ActivityResultContracts.TakePicturePreview()`; no `CAMERA` permission is declared
  because it delegates to the system camera app. Switching to CameraX requires adding it.
- Composable strings are hardcoded except `app_name` in `res/values/strings.xml`.
  `SGOMINUTASTheme` exists but is not applied in `MainActivity`; SAGO colors are hardcoded per screen.
- Real Firestore data verified 2026-11-24: `usuarios` (4 docs, **all 4 with `contrasena`**; the
  Google profile doc `e2MGLgZn4ONOqjM6PP25rBz6Fjm1` is gone from Firestore), `clientes` (2 docs),
  `minutas` (7 docs with `fotoBase64` inside the document, 5 with GPS fields). Firebase Auth still
  has 2 users (`qa@sagominutas.test` with uid `e2MGL…`, and `bryan171005@gmail.com`), so a Google
  login recreates the profile in Firestore; the role then comes from `ADMIN_EMAILS` in
  `auth.service.ts`. The WP6 migration script has been written and its dry-run verified, but
  **`--apply` has not been run**, so no fields have been renamed and no password has been deleted
  yet. Task 8's "assign `uid`/rol" cannot be done for these 4 legacy users (no email/uid); the
  documented exception is in `docs/MODELO_DATOS.md`. `backend/firestore.rules` exists but is
  **not deployed**, so direct client writes still work today. Do not rename fields directly: use
  the compatibility adapters in `scripts/migrar-datos.ts` and `docs/MODELO_DATOS.md`.
- `app/google-services.json` is committed; the web Firebase config is hardcoded in
  `app/web/src/firebase.js`. Never add service-account keys or other secrets.

## API contract and evidence

- `backend/openapi.yaml` → Swagger UI at `/docs/` (302/301 to `/docs/`), spec at `/openapi.json`.
- `docs/API_CONTRACT.md` documents Fase 1 endpoints; it must be extended in WP9 for Fase 2.
- `backend/postman/SAGO.postman_collection.json` is the exported collection (variable `token` empty).
- `docs/EVIDENCIAS.md` indexes Fase 1 evidence. Two screenshots are still pending because they require
  a logged-in session: `docs/evidencias/fase-1/render-servicio.png` (Render dashboard) and
  `docs/evidencias/fase-1/firebase/firestore-usuario.png`. Don't fake them.

## Git reality

- Remote: `https://github.com/bryan171005/SAGO_MINUTAS.git`. Default branch is **`master`**, not `main`
  (confirmed via `git ls-remote --symref origin HEAD`).
- The WP6 commit (`feat(fase2): datos seguros, reglas y migracion con dry-run (WP6)`) was authored
  by Jonathan Garcia Martinez `<alu.23131213@correo.itlalaguna.edu.mx>`. Git identity is configured
  locally in this repo only. Check `git rev-list --count HEAD` for the current commit count.
- Tag `v0.2.0-fase1` marks `a98bf`. Target tag for Fase 2 is `v0.3.0-fase2` (not created).
- Remote branches (verified with `git ls-remote --heads origin`): WP6 is present on `sagochapu`,
  `feature/datos-seguros` and `CopiaHugo`; `jonycopia` at `0a7715`; `master` at `1df968`; plus
  `Rayocopia` and `copia-main`. Local branches are `master`, `sagochapu`, `feature/datos-seguros`
  and `CopiaHugo`; `feature/datos-seguros` was merged into `sagochapu` with `--ff-only`, and
  `sagochapu` was merged into `CopiaHugo` with `--ff-only` on 2026-11-24.
- WP6 was pushed to `origin/sagochapu`, `origin/feature/datos-seguros` and `origin/CopiaHugo` with
  the user's explicit authorization. No push to `master` was made.
- `.idea/` is tracked, so `git status` is usually dirty (e.g. `M .idea/misc.xml`). Don't include
  unrelated IDE churn in commits.
- No branch protection, PR merging or CI workflows yet, although `.github/` now has PR/issue
  templates. The plan proposes Git Flow (`main`/`develop`/`feature/*`); until it exists, don't push,
  rewrite history or create release branches without the user's confirmation. The WP6 pushes were
  explicitly confirmed; the plan's merge order is still
  `feature/datos-seguros` → `feature/api-minutas` → `feature/api-catalogos` → `feature/contrato-fase2`.
- Full WP ownership and merge details remain in `docs/FASE_2_PLAN.md` §3.

## Before finishing a change

1. Android: `.\gradlew.bat assembleDebug` → `testDebugUnitTest` → `lintDebug` (with `JAVA_HOME` set).
2. Backend: `npm run typecheck` → `npm run typecheck:scripts` → `npm run build` → `npm test`
   inside `backend/`; `npm run migrar:dry-run` only when Firebase credentials are available.
3. Web: `npm run lint` → `npm run build` inside `app/web`.
4. Never commit `.idea/misc.xml`, `.env`, service accounts, tokens, generated `dist/` or
   `backend/backups/`. The root `.gitignore` covers `node_modules/`, `dist/`, `.env*`,
   `firebase-adminsdk*.json` and `backend/backups/`; update it if a new dependency needs another
   ignore rule.
