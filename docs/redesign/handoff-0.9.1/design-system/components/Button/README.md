# Button

Four kinds: primary CTA, dark link-button, outline button, round icon button.

- **Primary** (`g-btn--primary`): full width, `size-cta` 52, `radius-lg`, `accent` fill, `button` 17/700 white, optional 20px icon left. One per card or sheet, at its bottom. Disabled = `disabled` fill and a label that says what is missing («Выберите навык»). Hover `accent-ink`.
- **Dark** (`g-btn--dark`): `pitch-900`, white 14/600, `size-touch` high, `radius-md`. Navigation to a deeper screen («Профиль и прокачка ›»).
- **Outline** (`g-btn`): `surface`, 1px `control-border`, `ink-2` 14/600. Secondary or state-toggling actions («Пропуск матча…», «Вернуть в состав»). An ellipsis means it opens a sheet.
- **Icon** (`g-icon-btn`): 44 circle on `surface-3`, 18px stroke icon, `aria-label` required. Sheet back/close only.

**Labels** are verbs or the result: «Далее», «Бросить 1D16», «Взять Diving Catch», «Отметить пропуск», «Начать матч».
