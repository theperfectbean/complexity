# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the main Next.js 16 application, including API routes, React components, and library code under `app/src/`. Unit and integration tests live beside source files as `*.test.ts(x)`, while browser tests live in `app/e2e/`. Shared docs are in `docs/`, the embedding service is in `embedder/`, and database/bootstrap assets are in `postgres/` plus `docker-compose*.yml` at the repo root.

## Build, Test, and Development Commands
Run app commands from `app/`:

- `npm run dev`: start the local Next.js dev server.
- `npm run build`: create a production build with the repo’s build flags.
- `npm run lint`: run ESLint across the app.
- `npm test`: run Vitest unit and integration suites.
- `npm run test:e2e`: run Playwright end-to-end tests.
- `npm run test:coverage`: generate Vitest coverage output.
- `npm run test:smoke-models` / `npm run test:smoke-route`: targeted smoke checks for model and streaming paths.
- `docker compose up --build`: start the full local stack from the repository root.
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`: preferred local dev stack for HMR and faster UI iteration.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and keep files ASCII unless the file already requires otherwise. Prefer named exports in `app/src/lib/` and colocate tests with the code they verify. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case only for non-code filenames where already established. Linting is enforced with ESLint via `app/eslint.config.mjs`.

## Testing Guidelines
Vitest is the default framework for unit and integration coverage; Playwright covers end-to-end flows. Name tests `*.test.ts` or `*.test.tsx` and keep them adjacent to the target module when practical. For every fix or implementation, add focused regression coverage when feasible, then run at minimum the relevant Vitest files and `npm run lint`. Run `npm run build` for changes that affect app compilation, routing, or shared types. For chat, provider, or streaming work, also run the relevant smoke suite before closing the task.

## Commit & Pull Request Guidelines
Recent history uses short, imperative subjects such as `Fix: Resolve build errors...` and `Refactor: Decouple...`. Follow that pattern: `Fix: ...`, `Refactor: ...`, `Add: ...`, `Docs: ...`. Keep PRs scoped, describe the user-visible impact, list verification commands, and include screenshots for UI changes. Unless told otherwise, finish code changes by committing and pushing after verification passes, then check remote CI status.

## Security & Configuration Tips
Copy `.env.example` to `.env` and keep secrets out of git. Validate provider keys, auth settings, and database configuration before running smoke tests or Playwright. If database commands are run through Docker, disable interactive paging in `psql` with `PAGER=cat` or `-P pager=off`. Prefer the existing Docker Compose setup and migration scripts over ad hoc service changes.
