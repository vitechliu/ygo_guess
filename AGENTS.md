# Repository Guidelines

## Project Structure & Module Organization

`client/` contains the React interface, WebSocket client, and styles. `server/` contains Express routes, WebSocket handling, game rules, storage, and card caching. Keep message and state contracts in `shared/types.ts`. Reusable UI primitives live in `components/ui/`; the curated card IDs live in `config/card-pool.json`. Put automated checks in `tests/`, utility commands in `scripts/`, and static assets in `public/`. Build output (`dist/`), local data (`data/`), and test artifacts (`test-results/`) are ignored.

## Build, Test, and Development Commands

Use Node.js 24: run `nvm install 24` and `nvm use 24`, then `npm ci` so dependency setup does not rewrite `package-lock.json`. Copy `.env.example` to `.env`, then run `npm run dev` for the local server at port 3131. `npm run build` type-checks the project and builds both client and server; `npm start` runs the compiled server. `npm run cards:validate` checks the curated card pool. `docker compose up --build -d` starts the app with MySQL and Redis when those services are needed.

## Coding Style & Naming Conventions

Use TypeScript and TSX with strict types. For new code, use two-space indentation, semicolons, and the surrounding file's import style; avoid reformatting unrelated compact code. Name React components in PascalCase (`LobbySettings.tsx`), hooks with `use` (`use-mobile.ts`), and test files `*.test.ts`. Use the `@/` alias for project-root imports where appropriate. No formatter or lint command is configured; `npm run build` is the type-check gate.

## Testing Guidelines

Tests use Node's `node:test` and `assert` through `tsx`. Run `npm test` for unit and integration tests, `npm run test:e2e` for browser coverage, and `npx tsx tests/invite.e2e.ts` for invitation flows. `npm run test:production` requires `MYSQL_TEST_URL` and `REDIS_TEST_URL`; otherwise its service checks skip. Add focused tests for rule, privacy, persistence, or protocol changes. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Recent commits use short `feat:` and `fix:` subjects, though history is not fully consistent. Prefer `feat: describe change` or `fix: describe issue`. In pull requests, explain behavior and affected flows, list commands run, link the relevant issue when one exists, and include screenshots for UI changes. Follow the version policy in `README.md`: bump both `package.json` and `package-lock.json` when an update changes WebSocket/HTTP message structure or communication behavior, or core turn, guessing, scoring, or room behavior. Use `npm version patch --no-git-tag-version` for compatible core fixes, `minor` for compatible features, and `major` for incompatible protocol or saved-data changes. Style-only updates do not need a version bump.

## Client Version Compatibility

`shared/version.ts` reads `GAME_VERSION` from `package.json` and defines `MIN_CLIENT_VERSION`, the oldest supported webpage version. For each release, assess whether cached older pages can safely use the updated protocol and rules. Keep the minimum unchanged for compatible updates; raise it to the release version when critical changes require older pages to refresh. Keep it no higher than `GAME_VERSION`, and update it on major releases. Maintain player-facing release notes in `client/update-notes.md`.

WebSocket connections carry the webpage's build version. The server checks compatibility before restoring rooms or processing any game commands; missing or malformed versions, versions below the minimum, and different major versions are rejected. Preserve this server-side gate for creation, joining, and reconnects. Incompatible pages receive `UPDATE_REQUIRED`; the current UI stops reconnecting and offers a refresh that preserves invitation parameters. Legacy pages receive the existing text error.

`GET /api/version` and production entry HTML must remain uncached (`Cache-Control: no-store`); deploy matching frontend/backend builds and preserve these headers through proxies/CDNs. When changing this mechanism, run `npm test` (including `tests/version.test.ts`), `npm run build`, and `npx tsx tests/version.e2e.ts` for desktop/mobile refresh and room recovery checks. Version checks do not replace Cookie authentication.

## Configuration & Security

Keep secrets in `.env`, never commit them. Use `.env.example` for documented settings. Preserve server-side authorization and answer filtering when changing HTTP or WebSocket payloads; player identity comes from cookies, not client-supplied IDs.
