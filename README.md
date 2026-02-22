# postboy

Monorepo foundation for a Postman-like API client with dedicated web and API apps plus shared typed contracts.

## Workspace layout

- `apps/web`: Next.js React UI.
- `apps/api`: Fastify backend API.
- `packages/shared`: Shared request/response and collection model types.

## Tooling baseline

- `pnpm` workspace configured via `pnpm-workspace.yaml`.
- TypeScript is configured across all packages with a shared `tsconfig.base.json`.
- Linting and formatting are configured using ESLint (flat config) and Prettier.
- Environment templates are provided at the root and per app (`.env.example`).

## Local startup

### 1) Install dependencies

```bash
pnpm install
```

### 2) Start the web app

```bash
pnpm --filter @postboy/web dev
```

Web runs at `http://localhost:3000`.

### 3) Start the API app

```bash
pnpm --filter @postboy/api dev
```

API runs at `http://localhost:4000`.

## Architecture overview

### Packages

1. **Web (`apps/web`)**
   - Renders API collection/request UI.
   - Imports shared interfaces from `@postboy/shared` to guarantee type-safe request authoring.
2. **API (`apps/api`)**
   - Hosts request execution and persistence endpoints.
   - Uses shared `ResponseSnapshot` models so responses are serialized in a consistent shape.
3. **Shared (`packages/shared`)**
   - Canonical location for `RequestDefinition`, `ResponseSnapshot`, `Collection`, `Folder`, `Environment`, and `Variable` interfaces.

### Data flow

1. User composes a `RequestDefinition` in the web app.
2. Web sends the request payload to API endpoints using the configured base URL.
3. API executes/stubs request handling and returns a `ResponseSnapshot`.
4. Web renders response details and can persist collection/environment data shaped by shared models.

## Environment templates

Copy any relevant template before running apps:

- Root: `.env.example`
- Web: `apps/web/.env.example`
- API: `apps/api/.env.example`
