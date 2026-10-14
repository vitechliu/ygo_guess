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

## Configuration & Security

Keep secrets in `.env`, never commit them. Use `.env.example` for documented settings. Preserve server-side authorization and answer filtering when changing HTTP or WebSocket payloads; player identity comes from cookies, not client-supplied IDs.
