# Очистка кода: что сделать в будущих PR

Наследие, найденное при ревью ветки `imp/UI-update-p5` (октябрь 2026). В эту ветку не вошло, чтобы
UI-PR оставался читаемым. Каждый пункт — отдельный небольшой PR или коммит. Когда пункт сделан,
удалите его из файла.

## 1. Неиспользуемые CSS-классы

Эти классы есть в `src/styles/*.css`, но не встречаются ни в `src/**/*.mjs`, ни в `src/app.js`,
ни в `index.html`, ни в `scripts/` — ни на ветке, ни на `main`. В основном это остатки старых
вёрсток, которые давно переписаны. Всего около 370 строк.

| Группа | Классы | Файлы |
|---|---|---|
| Старый карточный конструктор | `builder-row`, `builder-row-head`, `builder-row-body`, `builder-row-main`, `builder-player-card`, `builder-player-list`, `builder-player-pool`, `builder-addons`, `builder-roster`, `builder-mode-field`, `available-player-actions`, `skill-search-hint` | `roster.css`, `responsive.css` |
| Старый редактор слотов | `roster-slot`, `roster-slots`, `roster-slot-add`, `slot-player-editor`, `slot-player-topline`, `slot-stat-editors`, `slot-skill-list`, `player-editor`, `player-skill-editor`, `saved-player-grid`, `saved-roster-player-list`, `skip-next-field`, `compact-field` | `roster.css`, `responsive.css` |
| Прочее | `segmented-control`, `roster-settings-panel`, `chip`, `full-width` | `roster.css`, `pages.css` |
| Сезон | `kv`, `legal-panel`, `season-overview-grid` | `season.css`, `responsive.css` |

**Не удалять** — собираются из переменных, поэтому поиск по имени их не находит:
`accent-icon-button`, `danger-icon-button` (`${tone}-icon-button` в `src/components/icons.mjs`),
`toast-error` (`toast-${tone}` в `src/components/toast.mjs`).

**Как удалять:**

- Если правило перечисляет несколько селекторов, удаляйте только мёртвый, а не всё правило:
  `.chip, .filter-button, .ghost-button` → `.filter-button, .ghost-button`.
- Перед удалением ещё раз поищите имя по всему `src/` — список мог устареть.
- Сохраняйте окончания строк CRLF и пустые строки между разделами в `responsive.css`.
- После: `npm run build`, затем пройти конструктор, редактор состава, страницу команды игрока,
  страницы сезона и администрирования.

## 2. Проверка неиспользуемого CSS в `npm run check`

`npm run check` находит неиспользуемые JS-функции, но не CSS-классы — поэтому пункт 1 и накопился.
Идея: скрипт в `scripts/`, который собирает имена классов из `src/styles/*.css` и ищет каждое в
`src/`, `index.html` и `scripts/`, со списком исключений для классов из переменных (см. выше).
Падать, если найден класс не из списка исключений.

## 3. «Coach's Safe» не переведён

В `renderSavedRosterPurchases()` (`src/screens/saved-roster.mjs`) заголовок карточки передаётся
строкой `"Coach's Safe"`, а не через `t()`. Это нарушает правило из `CLAUDE.md`. Нужен ключ в
`src/i18n/en.json` и `ru.json` (если термин остаётся английским — то же значение в обоих).

## 4. Сводка редактора состава на общем макете

Конструктор и страница команды игрока показывают сводку через `renderSummaryOverview()`
(`src/components/roster-editor/summary-panel.mjs`): подпись над значением, рядом блок правил.
Редактор состава — единственное место со старым видом «подпись слева, значение справа»
(`renderSummaryPanel()` и стили `.saved-roster-summary-panel`). Перевод на общий макет убрал бы
функцию и её CSS, но это меняет вёрстку: панель стоит в узкой боковой колонке
(`.saved-roster-top-grid`). Сначала решить, как она должна выглядеть.

## 5. Мелочь: `teamFavouredOptions()` дважды за рендер

`renderTeamRuleAccess()` (`src/components/roster-editor-shared.mjs`) вызывает
`teamFavouredOptions()` напрямую и ещё раз через `ensureDraftFavouredChoice()`. На скорость не
влияет; исправлять, только если будете менять эти функции по другой причине.
