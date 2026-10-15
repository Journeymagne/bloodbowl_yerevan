/**
 * What the maintenance page says, in both languages.
 *
 * The page cannot load the app's dictionaries or t(): during maintenance only
 * this directory and the fonts are served. So the strings live here, and a
 * test keeps the two languages in step. Times are Yerevan's, which is where
 * the league plays, whatever clock the reader's phone is on.
 */
const TIME_ZONE = "Asia/Yerevan";

export const STRINGS = Object.freeze({
  ru: Object.freeze({
    documentTitle: "Gata League · техобслуживание",
    tagline: "Blood Bowl Sevens · лига тренеров",
    plannedChip: "Плановые работы",
    plannedTitle: "Обновляем сайт",
    plannedLead: "Ставим новую версию. Составы, результаты и казна сохранены — после работ всё будет на месте.",
    unplannedChip: "Сбой",
    unplannedTitle: "Сайт временно недоступен",
    unplannedLead: "Что-то пошло не так — мы уже чиним. Всё, что было сохранено до сбоя, на месте.",
    doneChip: "Готово",
    doneTitle: "Сайт снова работает",
    doneLead: "Работы закончены. Если что-то выглядит странно — обновите страницу.",
    start: "Начало",
    end: "Окончание, примерно",
    progress: "Ход работ",
    timezoneNote: "Время — по Еревану",
    remaining: "Осталось около {minutes} мин",
    overdue: "Заканчиваем — осталось совсем немного",
    since: "Чиним с {time} · когда закончим, пока неизвестно",
    sinceUnknown: "Когда закончим, пока неизвестно",
    openSite: "Открыть сайт",
    check: "Проверить снова",
    checking: "Проверяем…",
    auto: "Страница сама проверяет сайт каждые 30 секунд",
    notYet: "Ещё не готово · проверили в {time}",
    unreachable: "Не удалось связаться с сайтом · {time}",
    tipsTitle: "Пока сайт недоступен",
    tipMatchTitle: "Играете матч?",
    tipMatch: "Записывайте TD, CAS, MVP и травмы на бумаге — внесёте в итоги матча после работ.",
    tipEditsTitle: "Правки в последние минуты",
    tipEdits: "Если сохранение не прошло, повторите его, когда сайт заработает.",
    tipQuestionsTitle: "Вопросы",
    tipQuestions: "Пишите администратору лиги в чат лиги в Telegram.",
    footer: "Неофициальный фанатский справочник лиги",
  }),
  en: Object.freeze({
    documentTitle: "Gata League · maintenance",
    tagline: "Blood Bowl Sevens · a coaches' league",
    plannedChip: "Planned maintenance",
    plannedTitle: "Updating the site",
    plannedLead: "We are installing a new version. Rosters, results and treasuries are saved — everything will be in place afterwards.",
    unplannedChip: "Outage",
    unplannedTitle: "The site is temporarily unavailable",
    unplannedLead: "Something went wrong and we are already fixing it. Everything saved before the outage is safe.",
    doneChip: "Done",
    doneTitle: "The site is back",
    doneLead: "Maintenance is over. If something looks odd, reload the page.",
    start: "Start",
    end: "Expected end",
    progress: "Progress",
    timezoneNote: "Times are Yerevan time",
    remaining: "About {minutes} min left",
    overdue: "Finishing up — almost there",
    since: "Fixing since {time} · no estimate yet",
    sinceUnknown: "No estimate yet",
    openSite: "Open the site",
    check: "Check again",
    checking: "Checking…",
    auto: "This page checks the site every 30 seconds",
    notYet: "Not ready yet · checked at {time}",
    unreachable: "Couldn't reach the site · {time}",
    tipsTitle: "While the site is down",
    tipMatchTitle: "Playing a match?",
    tipMatch: "Write TD, CAS, MVP and injuries down on paper and enter them in the post-match once we are back.",
    tipEditsTitle: "Last-minute edits",
    tipEdits: "If a save did not go through, repeat it once the site is back.",
    tipQuestionsTitle: "Questions",
    tipQuestions: "Ask the league administrator in the league's Telegram chat.",
    footer: "An unofficial fan reference for the league",
  }),
});

export function pickLocale(stored, navigatorLanguage) {
  if (stored === "ru" || stored === "en") return stored;
  return String(navigatorLanguage ?? "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

export function formatClock(ms, locale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE,
  }).format(ms);
}

function plannedView(flag, now, locale, strings) {
  const start = flag.startsAt ? Date.parse(flag.startsAt) : null;
  const end = flag.endsAt ? Date.parse(flag.endsAt) : null;
  const window = start || end
    ? { startsAt: start ? formatClock(start, locale) : "—", endsAt: end ? `≈ ${formatClock(end, locale)}` : "—" }
    : null;
  const progress = start && end && end > start ? Math.round(Math.min(1, Math.max(0, (now - start) / (end - start))) * 100) : null;
  let meta = "";
  if (end && end > now) meta = fill(strings.remaining, { minutes: Math.ceil((end - now) / 60000) });
  else if (end) meta = strings.overdue;
  return { state: "planned", chip: strings.plannedChip, title: strings.plannedTitle, lead: strings.plannedLead, window, progress, meta };
}

/**
 * @param {{kind: "planned"|"unplanned", startsAt: string|null, endsAt: string|null}|null} flag
 * @param {number} now epoch milliseconds
 * @param {"ru"|"en"} locale
 */
export function describeMaintenance(flag, now, locale) {
  const strings = STRINGS[locale];
  if (!flag) {
    return { state: "done", chip: strings.doneChip, title: strings.doneTitle, lead: strings.doneLead, window: null, progress: null, meta: "" };
  }
  if (flag.kind === "planned") return plannedView(flag, now, locale, strings);
  const meta = flag.startsAt ? fill(strings.since, { time: formatClock(Date.parse(flag.startsAt), locale) }) : strings.sinceUnknown;
  return { state: "unplanned", chip: strings.unplannedChip, title: strings.unplannedTitle, lead: strings.unplannedLead, window: null, progress: null, meta };
}

/**
 * The small line under the button: what the last check found.
 *
 * @param {object|null|undefined} result what /api/health said — undefined when
 *   it did not answer, null when the flag is down, the flag while it is up
 * @param {number} now epoch milliseconds
 * @param {"ru"|"en"} locale
 */
export function lastCheckText(result, now, locale) {
  if (result === null) return "";
  const strings = STRINGS[locale];
  return fill(result === undefined ? strings.unreachable : strings.notYet, { time: formatClock(now, locale) });
}

/**
 * Read the flag out of a /api/health reply.
 *
 * Only a reply that carries a `maintenance` field says anything: null means the
 * flag is down, an object means it is up. A 200 from something else (a proxy's
 * error page, an older server) is "unknown", never "done" — saying the site is
 * back when it is not sends the coach into a reload loop.
 *
 * @param {unknown} body the parsed JSON
 * @returns {object|null|undefined} undefined when the reply does not say
 */
export function flagFromHealth(body) {
  return body && typeof body === "object" && "maintenance" in body ? body.maintenance : undefined;
}
