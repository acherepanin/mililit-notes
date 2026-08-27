# Architecture And Libraries

This document describes the supported runtime. The removed legacy application
is not an architectural fallback.

## Runtime Topology

```text
Browser
  -> Next.js web /api proxy
    -> NestJS API
      -> PostgreSQL
      -> Redis / BullMQ -> worker
      -> S3-compatible object storage
      -> AI, SMTP, Telegram, and VK providers

Prometheus <- API and worker metrics
OpenTelemetry Collector <- API and worker traces -> Tempo
Alertmanager <- Prometheus alerts
```

Local Compose starts web, API, worker, PostgreSQL, Redis, MinIO, Mailpit, a
one-shot migration, and bucket initialization. The optional observability
override adds Prometheus, Alertmanager, OpenTelemetry Collector, and Tempo.
Production adds Caddy and replaces local builds with immutable registry images.

## Workspace Ownership

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router UI, browser state, lazy loading, API clients |
| `apps/api` | NestJS API, authentication, policy, validation, use cases |
| `apps/worker` | BullMQ consumers, scheduled cleanup, email, integrations |
| `packages/config` | Zod-validated shared environment configuration |
| `packages/db` | Drizzle schema, migrations, imports, backup verification |
| `infra/compose` | Local/production topology, images, deployment wrapper |
| `infra/observability` | Metrics, alerts, traces, retention configuration |

The API is a modular monolith. Feature modules live under `apps/api/src`:
`auth`, `notes`, `workspace`, `files`, `ai`, `integrations`, `notifications`,
`subscriptions`, `entitlements`, `admin`, and `observability`. Add behavior to
the owning module rather than creating a parallel service tree.

## Request Boundaries

The browser calls same-origin `/api/*`. The Next.js catch-all route proxies the
request to NestJS while preserving cookies and relevant response headers. UI
code uses domain clients such as `notes-api.ts`, `files-api.ts`, and
`subscriptions-api.ts`; components do not duplicate transport logic.

NestJS guards apply session authentication and CSRF protection globally.
Explicit public routes cover health, public shares, metrics, and verified
webhooks. Controllers validate transport input and delegate business work to
services. Ownership, roles, entitlements, quotas, and tool confirmation are
server decisions.

Background work is published through BullMQ. Jobs carry bounded correlation and
trace context, use retry/backoff, and must remain idempotent. The worker calls
internal API routes with a signed request; it never impersonates a browser
session.

## Data And Files

PostgreSQL is the transactional source of truth. `packages/db/src/schema` owns
the typed schema and `packages/db/drizzle` contains ordered SQL migrations.
Runtime schema synchronization is not used. Schema changes must update the
Drizzle model, migration, verifier, and relevant behavior tests together.

MinIO or another S3-compatible service stores file content. PostgreSQL stores
object keys, hashes, size, type, state, ownership, and note/folder relations.
Multipart upload completion is verified before a file becomes ready. Database
and object backups are treated as one matched recovery set.

Redis owns BullMQ state and short-lived coordination. Durable product state
must not exist only in Redis.

## Security Invariants

- Better Auth sessions use HttpOnly cookies; passwords are Argon2id hashes.
- TOTP and WebAuthn/Passkeys use the same authenticated account boundary.
- Secrets are loaded at runtime and never returned by API contracts.
- Provider endpoints pass an SSRF allowlist policy before outbound requests.
- Telegram and VK webhooks are verified and processed idempotently.
- Sensitive note/provider/integration values use versioned encryption keys.
- Logs, diagnostics, traces, and metrics exclude bodies, credentials, tokens,
  raw tool arguments, and unbounded user-controlled labels.
- Correlation IDs are validated, propagated across processes, and safe to show.
- Public links use opaque tokens and do not weaken owner-only mutation rules.

## Primary Libraries

### Workspace

| Library | Use |
| --- | --- |
| Node.js 24, pnpm, Turborepo | runtime, package manager, task graph |
| TypeScript, ESLint, Prettier | strict types and repository quality |
| Vitest, Playwright, axe-core | unit, browser, responsive, accessibility tests |

### Frontend

| Library | Existing role |
| --- | --- |
| Next.js 16, React 19 | App Router and UI runtime |
| TanStack Query | server-state cache, loading, retry, invalidation |
| Radix UI | accessible dialogs, dropdowns, tabs, tooltips |
| Tiptap, ProseMirror | rich-text editor and custom document nodes |
| Headless Tree, TanStack Virtual | virtualized hierarchical notes |
| dnd-kit | file/folder drag and drop |
| React Three Fiber, Three.js | responsive constellation background |
| Motion | stateful transitions and micro-interactions |
| Lucide React | interface icons |
| cmdk | command palette behavior |
| Sonner | toast feedback |
| DOMPurify | sanitizing rendered shared/editor HTML |
| highlight.js, lowlight | code-block languages and highlighting |
| Better Auth clients | sessions, TOTP, username, Passkeys |

The frontend uses Tailwind's PostCSS integration, but the established product
tokens and component styles are centralized in `globals.css`. Do not introduce
a second styling system for new work.

### Backend And Data

| Library | Existing role |
| --- | --- |
| NestJS, Fastify | modular HTTP API |
| Better Auth, Argon2 | identity, sessions, password security |
| Drizzle ORM, `pg`, `pg-cursor` | typed data access and bounded imports |
| Zod | environment and runtime input validation |
| BullMQ, ioredis | queues, retries, scheduled work |
| AWS SDK S3 | uploads, downloads, presigned URLs, backups |
| `file-type`, Archiver, fflate | file validation and archive flows |
| grammY, vk-io | Telegram and VK adapters |
| Nodemailer | verification, reset, and notification email |
| OpenTelemetry, Nest/Fastify loggers, prom-client | traces, structured logs, metrics |

### Infrastructure

PostgreSQL provides relational data, `pg_trgm`, and vector support. Redis backs
queues. MinIO provides S3-compatible storage. Caddy terminates TLS and is the
only public production entrypoint. Prometheus, Alertmanager, OpenTelemetry
Collector, and Tempo remain operator-only.

## Dependency Rules

1. Use browser or Node platform APIs when they are sufficient.
2. Reuse an installed library in its documented role before adding another.
3. Avoid two libraries for the same UI or infrastructure responsibility.
4. Keep dependencies in the package that imports them; shared root dependencies
   are for workspace tooling only.
5. Update manifests and `pnpm-lock.yaml` together and run `pnpm audit --prod`.
6. Do not replace proven domain engines with custom parsing, auth, crypto,
   editor, drag/drop, queue, or telemetry implementations.

## Configuration

Committed `.env.example` files document names only. Local Compose reads the
untracked `infra/compose/.env`; production reads a restricted external env file
through `NOTES_ENV_FILE`. Add shared variables to `packages/config`, update the
examples and Compose wiring, and never silently fall back to production-unsafe
credentials.
