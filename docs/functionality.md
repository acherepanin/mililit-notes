# Current Functionality

This is the supported product scope. It documents behavior, not historical
refactor milestones.

## Accounts And Security

- Registration, username/password login, logout, email verification, password
  recovery, profile editing, password change, and persisted preferences.
- HttpOnly sessions with server-side authorization and CSRF protection.
- Optional TOTP two-factor authentication with recovery codes.
- Passkey/WebAuthn registration, listing, naming, and removal.
- User/admin roles and administrator-only operations.
- RU/EN interface preference and dark/light/system appearance settings.

## Notes And Editor

- Create, read, update, move, rename, nest, pin, favorite, trash, restore, and
  permanently delete notes.
- Virtualized hierarchical navigation and server-backed search.
- Tags, templates, version history, version restore, JSON import/export, and
  owner-controlled public share links.
- Tiptap rich text with headings, lists, task lists, alignment, inline styles,
  blockquotes, links, code blocks, syntax languages, and copy fields.
- Link editing applies to the current text selection and uses the centralized
  editor link dialog.
- Optimistic save state with conflict and failure feedback.

## Files

- Folder tree, list/grid browsing, search, sorting, selection, movement, rename,
  duplication, deletion, drag/drop, and file properties.
- Multipart uploads with progress, cancellation, completion verification, and
  interrupted-upload cleanup.
- Presigned owner-scoped downloads, previews, usage/quota display, archives,
  and attachment to note/AI context.
- S3-compatible object storage with database metadata and SHA-256 verification.

## AI And Voice

- Persistent conversations and messages with note/file context.
- Streaming Responses-style assistant output and retryable failure states.
- Provider registry with encrypted write-only credentials and endpoint policy.
- Provider model synchronization and role-based model routing.
- User model selection constrained by administrator configuration and plan.
- Prompt definitions, immutable versions, eval cases/runs, review, activation,
  and rollback history.
- Server-owned tool registry, allowlists, audit records, quotas, and one-time
  approval/rejection for sensitive actions.
- Realtime browser voice when supported, recorded transcription fallback,
  speech output, cancellation, and media-track cleanup.
- Per-user/token usage summaries and atomic monthly reservations.

External AI behavior still depends on valid provider credentials, model access,
network policy, and quota. Local mock verification is not proof of a real
provider account.

## Telegram And VK

- Administrator configuration for both providers with write-only secrets.
- Connection tests, per-user link codes, linked-account state, permissions, and
  unlinking.
- Verified webhook ingestion with idempotent event storage and BullMQ delivery.
- Shared AI conversation/tool policy, quotas, and confirmation handling across
  browser and messenger identities.
- Retryable terminal delivery without executing an approved action twice.

Live bot delivery requires real provider tokens and webhook configuration.

## Subscriptions And Entitlements

- Visible plan catalog, current subscription, checkout/confirmation flow, and
  renewal state.
- Local mock checkout only when explicitly enabled for development.
- Administrator plan editing with revision conflicts and allowlisted fields.
- Administrator assignment of active plans to users.
- Server-enforced capabilities and quotas for notes, content size, storage,
  files, templates, versions, sharing, import/export, AI tokens, voice, and bot
  tools.
- Active Free plan fallback when no paid subscription applies.

## Notifications And Settings

- Persistent notification list, unread state, mark-one/read-all operations, and
  email/product notification preferences.
- Subscription events and relevant account state are exposed through the
  notification center.
- One responsive settings dialog contains profile, security, appearance, AI,
  voice, files, integrations, privacy, notifications, subscription, and all
  permitted administrator sections.

## Administration

- User, role, subscription, plan, storage, and service-health views.
- AI provider, model route, prompt, version, eval, review, and activation tools.
- Integration configuration and diagnostics.
- Cursor-paginated audit and diagnostic history with safe correlation details.
- Configurable bounded retention policies and cleanup status.
- Alert state, delivery totals, bounded acknowledgement silences, and removal of
  Notes AI-managed silences.

Administrator presentation does not grant authority; every operation is
protected by API role, session, CSRF, validation, and optimistic concurrency
checks.

## Observability And Operations

- Structured API/worker logs with redaction and correlation IDs.
- Prometheus metrics with fixed low-cardinality labels.
- Alert rules for target loss, API errors, and worker failures.
- Cross-process W3C traces through API, BullMQ, worker, and internal API calls.
- Bounded retention for request errors, activity, AI audits, terminal webhook
  events, Prometheus data, and traces.
- Health/readiness endpoints, restart policies, backup/restore verification,
  release health checks, and rollback procedures.

## Public Boundaries

Public access is deliberately limited to health/metrics where configured,
opaque public-share reads, and cryptographically verified webhook routes.
Everything else requires a session or an internal signed request. Existing
public links remain readable after a plan downgrade, while creation of new links
continues to respect current entitlements.

## Environment Acceptance

The repository verifies source, builds, local Compose, browser flows, data
invariants, backups, integrations with local substitutes, metrics, alerts, and
traces. A real production launch must separately validate DNS, TLS/ACME, GHCR
pulls, external SMTP, AI credentials/models, Telegram/VK webhooks, public-domain
browser flows, off-host backups, restore, and rollback.
