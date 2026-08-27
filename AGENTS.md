# Notes AI Engineering Rules

These rules apply to the whole repository. More specific `AGENTS.md` files may
add framework constraints for their directory.

## Start Here

Before changing code, read the relevant documents:

- `docs/architecture.md` for ownership and dependency boundaries.
- `docs/functionality.md` for the supported product behavior.
- `docs/frontend.md` before adding UI, styles, API clients, or browser state.
- `docs/development.md` for the required verification level.
- `docs/production.md` before changing Compose, images, secrets, backups, or
  rollout behavior.
- `docs/remaining-work.md` for the current production acceptance checklist.

Inspect the existing implementation and imports before creating a new file. A
new abstraction is justified only when an existing owner cannot represent the
behavior cleanly.

## Ownership

- `apps/web` owns presentation, browser interaction, and typed browser API
  clients. It must not implement authorization or trust client-provided roles.
- `apps/api` owns HTTP contracts, authentication, authorization, validation,
  quotas, provider policy, and transactional use cases.
- `apps/worker` owns retryable background work. Jobs must be idempotent and
  carry correlation context.
- `packages/config` is the only shared environment parsing boundary.
- `packages/db` owns schema, migrations, data import, and verification.
- `infra` owns runtime topology and observability configuration.

Keep feature code with its current owner. Do not add generic `utils`, `common`,
or `shared` directories for a single caller.

## Reuse Before Addition

- Use `apps/web/src/app/ui-controls.tsx` for tooltips, confirmations, icon
  buttons, switches, and searchable selects.
- Use Radix for dialog, dropdown, tab, and tooltip behavior; Lucide for icons;
  Sonner for transient feedback; and Motion for purposeful transitions.
- Keep frontend HTTP calls in the existing `*-api.ts` module for that domain and
  route them through `requestApi`. Do not scatter raw `fetch` calls in views.
- Extend the existing Tiptap extensions and editor dialogs instead of creating
  a second editor toolbar or link flow.
- Extend `settings-dialog.tsx` and its existing lazy panels for user/admin
  settings rather than creating a second settings application.
- Add shared visual values to the tokens at the start of `globals.css`. Avoid
  one-off copies of colors, shadows, radii, spacing, or focus behavior.
- Use existing backend modules and services. Do not create a second entitlement,
  encryption, correlation, object-storage, or integration-processing path.

The full frontend ownership map is in `docs/frontend.md`.

## Dependencies

Prefer the libraries already listed in `docs/architecture.md`. Add a dependency
only when platform APIs and current dependencies cannot solve the requirement
with less maintenance. Pin security- or runtime-sensitive packages consistently
with the existing manifests and update `pnpm-lock.yaml` in the same change.

## Security And Data

- Routes are authenticated unless explicitly marked public. Authorization,
  entitlements, quotas, confirmation, and ownership checks run on the backend.
- Preserve cookie, CSRF, SSRF, webhook signature, redaction, and correlation-ID
  boundaries.
- Never send provider, bot, encryption, database, or session secrets to the
  browser or logs.
- Validate external and flexible data at runtime. Do not replace validation
  with TypeScript casts.
- Change PostgreSQL only through an additive, reviewed migration. Update schema,
  migration, verifier, and affected tests together.
- Never delete or recreate named Docker volumes as part of routine development.

## Frontend Quality

- Preserve the demand-loaded workspace, settings, files, integrations, and
  constellation boundaries.
- Reuse Onest, the existing dark/light tokens, compact geometry, and cyan,
  green, and coral semantic accents. Do not add generic purple gradients,
  decorative blobs, nested cards, or a second design system.
- Icon-only actions need an accessible name and tooltip. Use semantic controls
  and preserve keyboard behavior.
- Verify at desktop, 390 px, and 320 px. No document-level horizontal overflow,
  clipped actions, viewport-escaping overlays, or text collisions are allowed.
- Respect `prefers-reduced-motion` and keep essential state understandable
  without animation or color alone.

## Verification

Run the narrowest relevant test while developing, then run `pnpm check` for a
finished repository change. UI changes also require the applicable Playwright
scenario and responsive inspection. Infrastructure changes require merged
Compose validation and the relevant health/config checker.

Report verification precisely: static checks do not prove a browser, database,
SMTP provider, external AI provider, messenger, DNS, TLS, backup restore, or
production rollout.

Update current documentation when behavior, ownership, dependencies, or
operations change. Do not add historical progress logs to the repository.
