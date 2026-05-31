---
name: Notes
description: Trusted Workspace 2.0 for notes, public sharing, admin controls, and AI-assisted work.
colors:
  bg-dark: "#0a0f18"
  bg-light: "#f5f7fb"
  surface-dark: "#111824"
  surface-light: "#ffffff"
  surface-quiet: "#101724"
  surface-raised: "#192437"
  text-dark: "#f6f8fb"
  text-light: "#152033"
  muted-dark: "#a6b3c6"
  muted-light: "#607086"
  accent-dark: "#4f8df7"
  accent-light: "#2f6fe4"
  accent-teal: "#2fb9ad"
  trust-amber: "#f0b35f"
  danger: "#f87171"
  warning: "#f2b84b"
  success: "#38c98b"
  info: "#68b7ff"
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
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.sm}"
    width: "31px"
    height: "31px"
  icon-button-primary:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.sm}"
    width: "31px"
    height: "31px"
  input-field:
    backgroundColor: "{colors.surface-quiet}"
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

Notes is a product UI first: a calm, modern workspace that makes daily writing, retrieval, admin, public sharing, and AI-assisted actions feel dependable. The system uses graphite surfaces, clean paper light mode, blue action color, teal operational states, and small-radius controls to support focused work without becoming dry or corporate.

The visual system is premium through restraint: clean tonal layers, sharp icon affordances, custom dropdowns, portal tooltips, visible focus rings, controlled motion, and consistent state language. Login, public share, and empty states can be more expressive; editor, admin, settings, and AI screens keep the task in front.

The system explicitly rejects generic AI/SaaS cliches: purple gradient branding, decorative orbs, neon glow, "Powered by AI" framing, pseudo-chat as the default screen, and visuals that read as a 2024 AI startup template.

**Key Characteristics:**
- Compact, readable, and task-focused.
- Trust blue identity with teal operational support, used for state and action.
- Tonal surfaces with subtle structural elevation, never decorative glow.
- Icon-led controls with custom tooltips and accessible labels.
- Motion that confirms state, never constant movement.

## 2. Colors

The palette is cool, restrained, and product-native: graphite dark mode, clean blue-white light mode, a clear blue action color, teal support states, and amber only for meaningful caution or warmth.

### Primary
- **Trust Blue** (`accent-dark`, `accent-light`): the primary action, selection, focus, and current-state color. Use it for meaningful decisions, not decoration.
- **Operational Teal** (`accent-teal`): secondary emphasis for AI/admin health, connected states, and calm support surfaces.

### Secondary
- **Trust Amber** (`trust-amber`): warning, expiration, and high-attention metadata. Do not use it as a decorative brand color.

### Neutral
- **Graphite Workspace** (`bg-dark`, `surface-dark`, `surface-quiet`): dark mode foundation for the app shell, panels, and dense controls.
- **Cool Paper** (`bg-light`, `surface-light`): light mode foundation, intentionally cool rather than cream or beige.
- **Primary Ink** (`text-dark`, `text-light`): body and title color.
- **Quiet Ink** (`muted-dark`, `muted-light`): secondary labels, metadata, descriptions, and table support text. It must still pass readable contrast.

### Named Rules

**The Blue Earns Attention Rule.** Blue marks actions, focus, selection, and live state. Do not spend it on decorative filler.

**The No AI Startup Palette Rule.** Do not turn blue, teal, violet, magenta, or glow into a purple-gradient AI brand. Notes must keep its own trusted workspace identity.

**Alternate dark themes (`dark`, `aurora`, `ember`, `ocean`).** Each variant adds a subtle hue bias on graphite bases; accents stay muted and are mixed into surfaces at ≤7%. `light` is the reference calm theme and should not be oversaturated. `ember` reads as warm charcoal with copper hints, not orange neon.

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

The system is mostly flat. Depth comes from tonal layering, borders, backdrop filtering, and restrained structural shadows on major panels, popovers, and focused document surfaces.

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
- **Primary:** electric-blue action fill with high-contrast icon color.
- **Hover / Focus:** border and tonal background shifts over 150-240ms. Focus must be visible and cannot rely on color alone.
- **Danger / Active:** semantic color variants keep the same box, radius, icon size, and tooltip behavior.

### Chips

- **Style:** compact pill or small rounded token with border and subtle tinted fill.
- **State:** selected tags and filters use blue or current-accent state, while inactive chips remain muted and low-contrast enough to stay secondary.

### Cards / Containers

- **Corner Style:** 12px for primary workspace containers, 8-12px for repeated tiles, 14px for auth panels and modals.
- **Background:** translucent or tonal surface colors from the dark/light theme tokens.
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

- **Theme tokens** (`app/front/src/themes.css`): semantic CSS variables per theme (`dark`, `light`, `aurora`, `ember`, `ocean`). Import from `styles.css`; do not duplicate palette values in components.
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
