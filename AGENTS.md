# AGENTS.md — SAGO Minutas

Android app (Kotlin + Jetpack Compose) for field "minutas" (tire-service visit reports), plus a
standalone React/Vite admin dashboard in `app/web`. A Node/TypeScript REST API now exists in
`backend/` and is the source of truth for business data; it is deployed at
`https://sago-api.onrender.com`.

`docs/PLAN_CUMPLIMIENTO_RUBRICA.md` is the overall roadmap and scoring plan — it describes the
**target**, not always the current code. For the current phase, read `docs/FASE_2_PLAN.md`.

**Last verified against the repo:** 2026-11-23 (branch `CopiaHugo`, HEAD `39fde`).

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| Fase 0 — repo/backlog | Done | `docs/FASE_0_PLAN.md` |
| Fase 1 — API base + Google auth + Swagger + deploy | **Done**, tag `v0.2.0-fase1` on `a98bf` | `docs/FASE_1_PLAN.md`, `docs/API_CONTRACT.md`, `docs/EVIDENCIAS.md` |
| Fase 2 — business API + secure Firestore | **Planned, not started** | `docs/FASE_2_PLAN.md` (WPs 6–9, split across 3 people) |
| Fases 3–7 — Android refactor, offline, extra, web, docs | Not started | `docs/PLAN_CUMPLIMIENTO_RUBRICA.md` |

Do not treat the Fase 2 tasks in `docs/FASE_2_PLAN.md` as implemented. In particular,
`firestore.rules`, `storage.rules`, `firebase.json`, `firestore.indexes.json` and the minuta/cliente/
metrica routers **do not exist yet**.

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
npm run build               # tsc -p tsconfig.json -> dist/
npm test                    # vitest run
```

- Entry points: `src/server.ts` (listen) and `src/app.ts` (router registration). **Only the WP7 owner
  edits `app.ts`** during Fase 2, to avoid merge conflicts.
- Structure today: `src/config/` (firebase Admin lazy init), `src/middlewares/` (`requiereAuth`,
  `requiereRol`, error handling), `src/auth/`, `src/usuarios/`, `src/routes/`, `src/types/`.
- `backend/openapi.yaml` is the **single source of truth** for Swagger. `/openapi.json` and `/docs/`
  are generated from it; don't hand-maintain a second copy.
- Tests: `backend/tests/health.test.ts` and `auth.test.ts` — 2 files, **32 tests passing** as of
  2026-11-20, using fake repositories (no live Firebase in unit tests).
- Deployed on Render as service `sago-api`, connected to branch `CopiaHugo`. Verified live:
  `/health`, `/docs/`, `/openapi.json`, `401` without token, `400` on invalid body, CORS.
- Credentials come **only** from environment variables (Firebase service account as base64). The real
  service account JSON lives outside the repo. Never add `.env`, IDs, tokens or keys to git.

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
- Real Firestore data today: `usuarios` (4 docs: 3 legacy with `contrasena`, 1 with `uid`/`email`/`rol`),
  `clientes` (1 doc), `minutas` (6 docs carrying `fotoBase64` inside the document, 4 with GPS fields).
  There is still no `firestore.rules`. Do not rename fields directly: Fase 2 needs compatibility
  adapters (see `docs/FASE_2_PLAN.md`, §4).
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
- The repo has **18 commits**, not one. `origin/CopiaHugo` points at `a98bf` (Fase 1); local
  `CopiaHugo` has one extra local commit `7789f` (the Fase 2 plan) pending push.
- Tag `v0.2.0-fase1` marks `a98bf`. Target tag for Fase 2 is `v0.3.0-fase2`.
- Branches in use: `master`, `Hugo`, `Copia` (all at the old base), `Rayocopia` (GPS/map work),
  `CopiaHugo` (integration), `feature/backend-core` (`768c6`, kept but superseded),
  `feature/swagger-tests` (`a98bf`, merged; safe to delete).
- `.idea/` is tracked, so `git status` is usually dirty (e.g. `M .idea/misc.xml`). Don't include
  unrelated IDE churn in commits.
- No branch protection, PR merging or CI workflows yet, although `.github/` now has PR/issue
  templates. The plan proposes Git Flow (`main`/`develop`/`feature/*`); until it exists, don't push,
  rewrite history or create release branches without the user's confirmation.
- Fase 2 branches and merge order are defined in `docs/FASE_2_PLAN.md` §3:
  `feature/datos-seguros` → `feature/api-minutas` → `feature/api-catalogos` → `feature/contrato-fase2`.

## Before finishing a change

1. Android: `.\gradlew.bat assembleDebug` → `testDebugUnitTest` → `lintDebug` (with `JAVA_HOME` set).
2. Backend: `npm run typecheck` → `npm run build` → `npm test` inside `backend/`.
3. Web: `npm run lint` → `npm run build` inside `app/web`.
4. Never commit `.idea/misc.xml`, `.env`, service accounts, tokens or generated `dist/`. The root
   `.gitignore` already covers `node_modules/`, `dist/`, `.env*` and `firebase-adminsdk*.json`;
   update it if a new dependency needs another ignore rule.
