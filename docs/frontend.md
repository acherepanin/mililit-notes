# Frontend Structure And Components

The frontend is a Next.js App Router application under `apps/web`. Components
are intentionally colocated because the current product is one application;
there is no separate UI package. Reuse the owners below before creating a new
component or style system.

## Entry And Loading Boundaries

| File | Responsibility |
| --- | --- |
| `layout.tsx` | Onest font, metadata, global CSS |
| `page.tsx` | public entry and lazy authenticated workspace boundary |
| `auth-boundary.tsx` | session state, registration/login/recovery/verification |
| `authenticated-workspace.tsx` | query provider and workspace handoff |
| `workspace-shell.tsx` | application shell, navigation, note state, AI dock |
| `share/[token]/*` | server route and sanitized public-share rendering |
| `api/[...path]/route.ts` | same-origin proxy from Next.js to NestJS |

Keep the existing demand-loaded boundaries. The constellation, authenticated
workspace, settings, files, workspace tools, integrations, and AI
administration are loaded only when their surface is needed. Do not import them
eagerly into the public authentication path.

## Shared UI Primitives

`ui-controls.tsx` is the first place to look for general controls:

| Export | Use |
| --- | --- |
| `UiProvider` | Radix tooltip provider for the workspace |
| `AppTooltip` | labeled portal tooltip behavior |
| `TooltipText` | truncated text with accessible full-value tooltip |
| `ConfirmDialog` | destructive or consequential confirmation |
| `AppIconButton` | stable icon-only action with label/tooltip/popover support |
| `AppSwitch` | accessible binary setting |
| `SearchableSelect` | typed searchable option selection |

Use these exports rather than implementing local tooltip, switch, confirmation,
icon-button, or combobox behavior. Add a new primitive here only after it has a
stable meaning for multiple current surfaces.

Radix Dialog, Dropdown Menu, Tabs, and Tooltip own overlay semantics and focus
behavior. Lucide owns interface icons. Sonner owns toast feedback. Do not add a
second modal, icon, notification, or select library.

## Feature Owners

### Workspace And Navigation

- `workspace-shell.tsx`: top rail, desktop/mobile navigation, notification
  popover, command palette, active note/file state, AI composer, voice state,
  settings/file lazy boundaries, and responsive shell.
- `note-tree.tsx`: virtualized note hierarchy and note selection.
- `workspace-tools.tsx`: search, templates, tags, versions, import/export, trash,
  and public share tools.
- `constellation-background.tsx`: full-viewport Three.js field and reduced-motion
  behavior. It is the only decorative scene owner.

Extend these owners instead of adding another app shell, mobile navigation,
command palette, tree, or background layer.

### Editor

- `note-editor.tsx`: Tiptap instance, toolbar, save state, selection, and link
  workflow.
- `editor-link-dialog.tsx`: create/update/remove link behavior for the current
  selection.
- `code-block.tsx`: code-block extension, syntax registry, language selector,
  copy action, and current-block selection.
- `copy-field.tsx`: custom Tiptap copy-field node, secret display, and kind
  selection.

Add editor behavior as a Tiptap extension or to the existing toolbar/dialog.
Do not introduce `contentEditable` alternatives or duplicate link/code dialogs.

### Files

- `file-workspace.tsx`: folders, grid/list content, uploads, progress, drag/drop,
  selection, movement, archive, properties, and deletion confirmation.
- `FileNavigation` from the same module owns the file navigation pane.
- `files-api.ts` owns all browser file contracts and archive URL construction.

Keep file mutations and cache invalidation in this feature and TanStack Query.

### Settings And Administration

- `settings-dialog.tsx`: the single responsive personal/admin settings shell,
  profile, security, appearance, notifications, subscription, plans, users,
  monitoring, retention, audit, and diagnostics.
- `admin-ai-settings.tsx`: lazy AI provider, models, routes, prompts, versions,
  evals, review, and activation panels.
- `integration-settings.tsx`: lazy user/admin Telegram and VK configuration.

New settings belong in the current navigation and content ownership model. Do
not create a second settings route or administration application unless product
navigation is intentionally redesigned.

## Browser API Clients

| File | Domain |
| --- | --- |
| `notes-api.ts` | shared request/error transport, notes, workspace operations |
| `files-api.ts` | folders, uploads, stored files, usage, archives |
| `ai-api.ts` | conversations, streaming events, models, tools, usage |
| `voice-api.ts` | microphone, WebRTC, recording, transcription, speech |
| `subscriptions-api.ts` | plans, current subscription, checkout |
| `notifications-api.ts` | list, preferences, read state |
| `integrations-api.ts` | user/admin Telegram and VK contracts |
| `admin-api.ts` | overview, users, plans, history, retention, alerting |
| `admin-ai-api.ts` | providers, models, routes, prompts, evals |
| `auth-client.ts` | Better Auth username/TOTP client |
| `security-auth-client.ts` | Better Auth TOTP/Passkey client |

Add an endpoint to its existing domain object and call it through `requestApi`.
Keep response types next to that domain until a generated contract package is
introduced for a measured reason. Raw `fetch` is limited to transport and
protocol-specific code such as streaming or WebRTC.

## State Rules

- TanStack Query owns remote server state, retries, invalidation, and mutation
  feedback.
- Local React state owns transient view state only: open surfaces, selection,
  drafts, upload progress, and media handles.
- Better Auth owns session/security actions; do not mirror credentials or bearer
  tokens in local storage.
- The URL owns the public share token; authenticated workspace navigation is
  currently shell state.
- Avoid duplicate caches or global context for state already owned by Query,
  Better Auth, Tiptap, or a feature component.

## Visual System

`globals.css` is the visual source of truth. Dark and light tokens are declared
at the top of the file: field/surface colors, text, lines, semantic cyan/green/
coral accents, danger/warning, opacity, blur, spacing, editor sizing, and
shadows. User appearance preferences update the existing CSS variables.

Rules:

- Use Onest with the existing fallbacks and fixed rem sizes; letter spacing is
  zero and UI type does not scale with viewport width.
- Cyan means primary action/current context, green means success/live voice,
  and coral means files/admin/high attention. Color is not decoration alone.
- Glass and large shadows belong to structural layers. Repeated rows and tiles
  use restrained surfaces and borders; do not nest cards.
- Major surfaces use at most 8 px corner radius. Pills are for tags/status only.
- Use existing focus behavior, stable control dimensions, and semantic disabled,
  error, loading, empty, and success states.
- Keep the note as the primary uninterrupted surface. Settings and admin remain
  dense, scannable, and task-oriented.
- Do not add purple AI gradients, orbs, bokeh, generic SaaS cards, or a second
  theme/token file.

## Responsive And Accessibility Contract

The accepted widths are desktop, 390 px, and 320 px. Navigation becomes an
overlay below the desktop layout, settings become a full-screen surface on
small screens, and mobile uses the established bottom navigation. Portal
content must collision-fit the viewport.

Every change must preserve:

- no document-level horizontal overflow;
- no overlapping text, clipped commands, or unreachable dialog actions;
- 44 px coarse-pointer targets where touch interaction requires them;
- keyboard navigation, Escape behavior, focus return, and accessible names;
- meaningful state without color alone;
- reduced-motion and forced-color readability;
- RU/EN labels without truncating the action's meaning.

Use existing Playwright coverage in `e2e/workspace-audit.spec.ts` for functional,
responsive, screenshot, and axe assertions. Extend the nearest scenario rather
than creating a duplicate suite.

## Before Adding A Component

1. Search the feature owner and `ui-controls.tsx` for the same behavior.
2. Check Radix, Lucide, Tiptap, Query, dnd-kit, Motion, and browser APIs already
   installed for the required primitive.
3. Decide whether the code is feature-specific or genuinely shared.
4. Reuse existing tokens and all interaction states.
5. Preserve lazy loading and avoid moving heavy dependencies into `page.tsx`,
   `auth-boundary.tsx`, or other public initial chunks.
6. Add the smallest relevant unit/Playwright assertion and update this catalog
   when ownership changes.
