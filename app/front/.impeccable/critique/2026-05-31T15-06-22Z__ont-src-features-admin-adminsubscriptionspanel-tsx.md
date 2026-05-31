---
target: subscription plan cards and editor
total_score: 25
p0_count: 0
p1_count: 3
p2_count: 2
timestamp: 2026-05-31T15-06-22Z
slug: ont-src-features-admin-adminsubscriptionspanel-tsx
---
# Design Critique: тарифные карточки и редактор плана

**Target:** `app/front/src/features/admin/AdminSubscriptionsPanel.tsx` (+ `AccountPage`, `SubscriptionPlanCard`, `PlanEditorFeatureIcons`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Нет выделения текущего тарифа на карточке; скролл списка фич без affordance |
| 2 | Match System / Real World | 3 | RU/EN в целом ок; «Notes AI» смешивает языки; модель «клик/двойной клик» не из реального мира |
| 3 | User Control and Freedom | 2 | Случайное отключение опции одним кликом; нет undo для entitlements в редакторе |
| 4 | Consistency and Standards | 3 | CircleHelp у полей хорош; ряд иконок без подписей; AI-модель в другом layout |
| 5 | Error Prevention | 2 | Отключение workspace/AI/files без подтверждения; числовые лимиты без inline-валидации |
| 6 | Recognition Rather Than Recall | 2 | 9 icon-only toggles; повторное открытие настроек только через двойной клик |
| 7 | Flexibility and Efficiency | 2 | Horizontal wheel помогает; клавиатура для иконок entitlements отсутствует |
| 8 | Aesthetic and Minimalist Design | 2 | 8 строк фич с одинаковым весом; плотный admin-editor внутри карточки |
| 9 | Error Recovery | 3 | Cancel/Save в редакторе; toasts при сохранении |
| 10 | Help and Documentation | 3 | labelTooltip у лимитов; подсказки про двойной клик спрятаны в tooltip иконки |
| **Total** | | **25/40** | **Acceptable — нужны точечные UX-правки до «Good»** |

## Anti-Patterns Verdict

**LLM assessment:** Не типичный AI-slop (нет фиолетовых градиентов, орбов, neon). Но есть SaaS-pricing tell: сетка одинаковых карточек с декоративным артом, sticker, ✓/✗ списком. Для Notes это допустимо на публичном/pricing слое (PRODUCT.md), если карточки помогают сравнивать, а не украшают ради украшения. Риск: border-radius 18px + border + inset highlight + sticker drop-shadow слегка «ghost-card». Декор в углу не мешает задаче, но список фич уже конкурирует с ним за внимание.

**Deterministic scan:** 0 findings по 4 TSX-файлам.

**Browser visualization:** не выполнялся (нет browser automation в сессии).

## Overall Impression

Карточки стали заметно зрелее: темы, зарезервированное описание, объединённые строки лимитов, спокойная типографика. Главный разрыв — **admin-редактор entitlements**: компактность достигнута ценой discoverability. На стороне аккаунта пользователю сложно быстро понять «мой тариф» и «чем отличаются планы» без длинного сканирования 8 строк.

## What's Working

1. **Иерархия карточки (шапка → описание → список → цена)** — логичный ритм, цена прижата к низу, отступы между блоками читаются.
2. **Объединение лимитов в parent-row + details** (блокноты, AI, файлы) — снижает шум vs отдельные строки «включено/лимит».
3. **CircleHelp + короткие placeholders** в popover — правильное разделение «пример в поле / правило в подсказке», в духе остальной админки.

## Priority Issues

### [P1] Скрытая модель «клик выключает / двойной клик настраивает»
**Why:** Админ не узнает правило без tooltip. Один клик по активной иконке workspace/AI/files отключает опцию — высокий риск случайной потери настроек.
**Fix:** Разделить affordances: toggle и «настроить» (отдельная иконка шестерни, long-press, или клик открывает popover, выключение только повторным явным toggle). Убрать двойной клик как единственный путь к настройкам.
**Suggested command:** `$impeccable distill app/front/src/components/PlanEditorFeatureIcons.tsx`

### [P1] Icon-only wall в редакторе entitlements (9 иконок без подписей)
**Why:** Нарушает Miller/Cowan (>4 опций), плохо для Jordan и для возврата через месяц. Tooltip не заменяет постоянную подпись в форме настроек.
**Fix:** Сгруппировать: «Основное / AI / Файлы / Публикация»; или compact chips с icon+короткий label; или legend под рядом.
**Suggested command:** `$impeccable layout app/front/src/components/PlanEditorFeatureIcons.tsx`

### [P1] Текущий тариф не выделен на карточках в Account
**Why:** Summary сверху легко оторвать от сетки; при горизонтальном скролле пользователь сравнивает «вслепую».
**Fix:** State `current` на карточке: border/accent, badge «Ваш тариф», disabled CTA или «Текущий».
**Suggested command:** `$impeccable polish app/front/src/features/account/AccountPage.tsx`

### [P2] Список из 8 фич — высокая когнитивная нагрузка для сравнения
**Why:** Все строки одного визуального веса; boolean и лимиты смешаны; пользователь не видит групп «база / pro / AI».
**Fix:** 3–4 группы с micro-heading или collapsible; или highlight diff vs текущего плана.
**Suggested command:** `$impeccable distill app/front/src/utils/planFeatureLines.ts`

### [P2] Scroll внутри карточки без affordance
**Why:** На 440–560px высоты и длинных RU-строках нижние фичи и цена могут быть ниже fold; overflow:auto без fade/scrollbar hint.
**Fix:** Gradient fade снизу списка, тонкий scrollbar, или уменьшить min-height на mobile.
**Suggested command:** `$impeccable adapt app/front/src/styles.css` (subscription-plan-card)

## Persona Red Flags

**Alex (Power User, admin):** Редактирование entitlements — только мышь, 9 иконок без текста, двойной клик для re-open settings. Нет batch/duplicate plan. Abandonment при частой настройке тарифов.

**Jordan (First-Timer, admin):** Не понимает, что иконка с active state — это popover, а не просто «включено». Публичные ссылки vs экспорт — только по иконкам. Без легенды будет кликать наугад.

**Riley (Stress Tester):** Случайный single-click disable с 220ms delay. Длинное название тарифа + описание — ellipsis без явного «ещё» кроме focus tooltip. Inactive badge «неактивен» lowercase — выглядит как debug string.

**Notes subscriber (project persona):** 8 строк × N тарифов = утомительное сравнение. «Notes AI» на RU-странице. Нет «рекомендуем» / popular tier для выбора по умолчанию.

## Minor Observations

- `border-radius: 18px` на `.plan-card-shell` чуть выше product guideline (12–16px).
- Feature detail 0.68rem — риск для WCAG на muted text (проверить контраст).
- Admin plan editor живёт внутри `PlanCardShell` — WYSIWYG ожидание vs форма с полями может путать.
- Dead CSS: `.admin-plan-popover__disable` после удаления кнопки.
- `planGroupFeatures` в i18n не используется в UI редактора.

## Questions to Consider

- Нужен ли пользователю **полный** список entitlements на карточке, или достаточно 4–5 ключевых + «Все возможности»?
- Должен ли admin-editor **выглядеть как карточка**, или лучше отдельная панель редактирования с preview справа?
- Тарифы — это **conversion surface** (можно смелее) или **account utility** (нужна максимальная ясность)?
