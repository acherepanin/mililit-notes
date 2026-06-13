---
name: Notes
description: Trusted Workspace 2.0 for notes, public sharing, admin controls, and AI-assisted work.
colors:
  bg-dark: "#0f1218"
  bg-dark-2: "#161b24"
  bg-light: "#eef3fb"
  bg-light-2: "#e3ebf7"
  surface-dark: "rgb(24 30 42 / 50%)"
  surface-dark-2: "rgb(32 40 54 / 44%)"
  surface-light: "rgb(255 255 255 / 64%)"
  surface-light-2: "rgb(248 251 255 / 58%)"
  text-dark: "#eef2f8"
  text-light: "#14213a"
  muted-dark: "#9fb0c4"
  muted-light: "#566a86"
  accent-dark: "#5b9bf0"
  accent-light: "#2f6fe4"
  line-dark: "rgb(150 190 255 / 12%)"
  line-light: "rgb(47 111 228 / 18%)"
  danger-dark: "#f0857f"
  danger-light: "#e5484d"
  warning: "#e6b870"
  success: "#5fcf9c"
  info: "#76c0ff"
typography:
  title:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 760
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  micro:
    fontFamily: "Aptos, Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  mono:
    fontFamily: "Cascadia Code, JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  modal: "14px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  panel: "24px"
components:
  icon-button:
    backgroundColor: "{colors.surface-dark-2}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.sm}"
    width: "31px"
    height: "31px"
  icon-button-primary:
    backgroundColor: "{colors.accent-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    width: "31px"
    height: "31px"
  input-field:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 10px"
  surface-panel:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: Notes

## 1. Overview

**Creative North Star: "Trusted Workspace 2.0"**

Notes is a product UI first: a calm, modern workspace that makes daily writing, retrieval, admin, public sharing, and AI-assisted actions feel dependable. The system uses a deep blue-graphite dark mode, a cool paper light mode, a single blue action color, and small-radius controls to support focused work without becoming dry or corporate. The shell panels (sidebar and workspace) are transparent glass: no fill and no backdrop blur, so a subtle full-screen "hi-tech space" relief (orbits, faint grid, scattered stars rendered as an inline SVG) reads softly behind the content.

The visual system is premium through restraint: transparent shell over a quiet textured background, clean tonal layers inside panels, sharp icon affordances, custom dropdowns, portal tooltips, visible focus rings, controlled motion, and consistent state language. Login, public share, and empty states can be more expressive; editor, admin, settings, and AI screens keep the task in front.

The system explicitly rejects generic AI/SaaS cliches: purple gradient branding, decorative orbs, neon glow, "Powered by AI" framing, pseudo-chat as the default screen, and visuals that read as a 2024 AI startup template.

**Key Characteristics:**
- Compact, readable, and task-focused.
- Single trust-blue identity, used for action, selection, focus, and live state.
- Transparent glass shell over a subtle space-relief background; depth from border and structural shadow, never decorative glow.
- Tonal, near-opaque surfaces inside panels so controls stay crisp over the textured background.
- Icon-led controls with custom tooltips and accessible labels.
- Motion that confirms state, never constant movement.

## 2. Colors

The palette is cool, restrained, and product-native: a deep blue-graphite dark mode, a cool blue-white light mode, a single clear blue action color, and a small semantic set (red danger, amber warning, green success, blue info). There is no teal or amber brand accent; blue carries identity.

### Primary
- **Trust Blue** (`accent-dark` `#5b9bf0`, `accent-light` `#2f6fe4`): the only brand accent. Primary action, selection, focus, current-state, and links. The light value is darkened for contrast on near-white surfaces. Use it for meaningful decisions, not decoration.

### Semantic
- **Danger** (`danger-dark` `#f0857f`, `danger-light` `#e5484d`): destructive actions and errors.
- **Warning** (`warning` `#e6b870`): expiration, caution, high-attention metadata. Not a decorative brand color.
- **Success** (`success` `#5fcf9c`) and **Info** (`info` `#76c0ff`): positive state and informational status.

### Neutral
- **Blue Graphite** (`bg-dark` `#0f1218`, `bg-dark-2`, `surface-dark`/`surface-dark-2`): dark mode foundation. Panels are translucent but near-opaque enough to keep contrast over the background relief.
- **Cool Paper** (`bg-light` `#eef3fb`, `surface-light`): light mode foundation, intentionally cool rather than cream or beige.
- **Hairline** (`line-dark`, `line-light`): thin accent-tinted borders used instead of heavy separators.
- **Primary Ink** (`text-dark`, `text-light`): body and title color.
- **Quiet Ink** (`muted-dark`, `muted-light`): secondary labels, metadata, descriptions, and table support text. It must still pass readable contrast.

### Named Rules

**The Blue Earns Attention Rule.** Blue marks actions, focus, selection, and live state. Do not spend it on decorative filler.

**The No AI Startup Palette Rule.** Do not turn blue, violet, magenta, or glow into a purple-gradient AI brand. Notes must keep its own trusted workspace identity.

**Themes (`dark`, `light`, `system`).** There are exactly three user themes. `dark` is deep blue-graphite; `light` is cool paper; `system` follows the OS via `prefers-color-scheme` and is resolved to `dark` or `light` at the DOM level in `themes.ts` (so it reuses the dark/light variable blocks, with no third palette to maintain). The old `aurora` / `ember` / `ocean` variants were removed.

**The Transparent Shell Rule.** The sidebar and workspace shells have no background fill and no backdrop blur in any theme. They show the body background (a subtle SVG "space" relief tinted toward the accent: `rgba(150,190,255,…)` in dark, `rgba(47,111,228,…)` in light) through to the page. Interactive surfaces inside (icon tiles, fields, rows, tables) stay near-opaque so contrast stays predictable over that texture.

## 3. Typography

**Display Font:** Aptos / Segoe UI Variable stack.
**Body Font:** Aptos / Segoe UI Variable stack.
**Label/Mono Font:** Cascadia Code / JetBrains Mono for code and technical text.

**Character:** The type system is product-native and stable. It uses one strong sans stack for UI, dense labels, editor chrome, settings, admin data, and buttons.

### Hierarchy
- **Title** (760 weight, `1.125rem`, 1.2 line-height): compact panel titles, modal headings, selected-note title, and admin section headers.
- **Body** (400 weight, `0.9375rem`, 1.45 line-height): default UI copy, form text, editor-adjacent labels, and readable settings content.
- **Label** (700 weight, `0.8125rem`, 1.25 line-height): controls, table labels, filters, metadata, and small repeated UI text.
- **Micro** (700 weight, `0.75rem`, 1.2 line-height, 0.08em for uppercase labels): counters, compact helper labels, dense settings metadata, and tiny status text.
- **Mono** (500 weight, `0.875rem`, 1.5 line-height): code blocks, technical values, copied fields, and developer-facing strings.

### Named Rules

**The Product Scale Rule.** Do not use hero-sized fluid headings inside the app. Product screens use fixed rem sizes so dense layouts remain stable.

**The No Display Drama Rule.** Marketing pages may earn larger type. Editor, admin, AI settings, and note controls must stay compact and readable.

## 4. Elevation

The system is mostly flat. Depth comes from tonal layering, hairline borders, and restrained structural shadows on major panels, popovers, and focused document surfaces. The sidebar and workspace shells are transparent (border plus structural shadow only, no backdrop blur); the subtle background relief, not glow, carries atmosphere.

### Shadow Vocabulary
- **Panel Shadow** (`0 18px 56-60px` at low alpha): used on major panels, dropdowns, modals, and public share cards.
- **Document Shadow** (`0 16px 50px` at low alpha): used only to separate the writing surface from the workspace.
- **No Shadow** (`none`): default for buttons, chips, fields, and dense list rows.

### Named Rules

**The Structural Shadow Rule.** Shadows separate major layout regions only. Component depth should mostly come from color, border, and state.

**The No Ghost Card Rule.** Do not pair a 1px border with a soft wide drop shadow on cards or buttons.

## 5. Components

### Buttons

- **Shape:** small, square, and icon-led for tool actions (8px radius, 31px box).
- **Primary:** blue action fill with a high-contrast (white) icon. Used for the main create action.
- **Hover / Focus:** every `icon-action` variant (plain, primary, danger, active) shares one hover/focus treatment, a soft accent-tint background and border shift over ~240ms, so the create-note button hovers with the same color and motion as the surrounding icons. Focus must be visible and cannot rely on color alone.
- **Danger / Active:** semantic color variants keep the same box, radius, icon size, and tooltip behavior.

### Chips

- **Style:** compact pill or small rounded token with border and subtle tinted fill.
- **State:** selected tags and filters use blue or current-accent state, while inactive chips remain muted and low-contrast enough to stay secondary.

### Cards / Containers

- **Corner Style:** 14px for the sidebar/workspace shells, 12px for primary containers, 8-12px for repeated tiles, 14px for auth panels and modals.
- **Background:** the sidebar/workspace shells are fully transparent (border plus shadow only). Inner panels and tiles use near-opaque tonal surface colors from the theme tokens so they stay legible over the background relief.
- **Shadow Strategy:** no component shadow by default; use tonal separation and borders.
- **Border:** thin, cool, and low-saturation. Colored side stripes are forbidden.
- **Internal Padding:** dense by default (8-12px), with 20px reserved for auth or focused panels.

### Inputs / Fields

- **Style:** 38px compact field shells, 8px radius, thin border, transparent or tonal panel fill, icon on the left when useful.
- **Focus:** border shifts toward primary blue and may add a restrained focus ring.
- **Error / Disabled:** semantic state color plus disabled opacity. Labels, tooltips, and messages must explain the state.

### Navigation

- **Style:** sidebar plus workspace shell, compact topbar, icon actions, command palette, and portal-based dropdowns.
- **Active State:** active navigation must be visible through text/icon color and background or border change.
- **Mobile Treatment:** sidebar collapses into an overlay and must not obscure the editor without a clear close affordance.

### Shared UI primitives (extracted)

- **Theme tokens** (`app/front/src/themes.css`): semantic CSS variables for the two real themes (`dark`, `light`). `system` is resolved to one of these at the DOM level (`themes.ts` `applyTheme` / `resolveAppliedTheme`, with a `prefers-color-scheme` listener), so it needs no separate block. Import from `styles.css`; do not duplicate palette values in components.
- **Focus tokens:** `--focus-ring-width`, `--focus-ring-offset`, `--focus-ring-color`. Applied globally via `:focus-visible` in `styles.css`. Composite controls (`field-shell`, `search-box`) use `:focus-within` on the shell and suppress inner input outlines.
- **Touch tokens:** `--touch-target-min` (44px). Applied on coarse pointers and mobile breakpoints for icon actions, subscription controls, and sidebar items.
- **Z-index scale:** `--z-base` (1), `--z-sidebar` (30), `--z-sticky` (40), `--z-dropdown` (120), `--z-overlay` (260), `--z-modal-backdrop` (1800), `--z-modal` (1850), `--z-toast` (1900), `--z-tooltip` (2000). Portal menus and modals must use these tokens, not ad-hoc values.
- **`usePortalMenu`**: positions portal menus, handles resize/scroll, outside click, and Escape. Use for any anchored listbox/popover.
- **`PortalListbox`**: standard option list with `custom-select__menu` / `custom-select__option` styling. Pair with `usePortalMenu` when the trigger is custom (settings theme row, tag filter).
- **`CustomSelect`**: labeled dropdown built on `usePortalMenu` + `PortalListbox`.
- **`EmptyState`**: unified empty UI (`tone`: `workspace` | `panel` | `inline` | `plain`). Replaces ad-hoc `empty-editor`, `note-tool-empty` blocks.
- **`SettingsMenuItem`**: sidebar settings row with icon, label, and optional value column.

### Signature Component

**AI Assistant:** a floating assistant with compact chat and settings. It should feel integrated and permission-aware: provider selection, usage, bot access, and confirmations remain clear, controlled, and local to the user's workflow.

## 6. Do's and Don'ts

### Do:

- **Do** keep working screens calm, compact, and task-focused.
- **Do** use the existing blue/cyan accent vocabulary for action, selection, focus, and status.
- **Do** use custom `IconButton`, `Tooltip`, `TooltipText`, `CustomSelect`, `Modal`, and `ToastHost` patterns instead of native browser UI for product controls.
- **Do** support RU/EN strings by allowing ellipsis, tooltips, and stable control widths.
- **Do** make motion expressive for transitions, loading, success, and state feedback, with `prefers-reduced-motion` support.
- **Do** keep marketing, landing, pricing, and public conversion pages bolder than the authenticated workspace.

### Don't:

- **Don't** use purple gradient branding, decorative orbs, neon glow, "Powered by AI" framing, or pseudo-chat as the default screen.
- **Don't** make the product look like a generic 2024 AI/SaaS startup.
- **Don't** use dry corporate admin templates that make the app feel under-designed.
- **Don't** push command-center aesthetics into everyday note work.
- **Don't** use colored `border-left` or `border-right` stripes wider than 1px on cards, callouts, or list items.
- **Don't** use gradient text.
- **Don't** use native `alert`, `prompt`, `confirm`, native `title`, or browser selects in the app UI.
- **Don't** let decorative motion run constantly or ignore `prefers-reduced-motion`.
