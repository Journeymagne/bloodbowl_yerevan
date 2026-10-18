/**
 * The league overview cards, as data only: the reference lists and searches them
 * (screens/ref/index.mjs, list.mjs) and draws each one (screens/ref/article.mjs).
 *
 * The card data itself lives in data/overview-cards-{en,ru}.mjs — task 10.4 of the refactor plan
 * moves it into content/Gata/Overview/*.md so it stops being wired-in code.
 */
import { state } from "../core/state.mjs";
import { overviewCards } from "../data/overview-cards-en.mjs";
import { overviewCardsRu } from "../data/overview-cards-ru.mjs";

export function activeOverviewCards() {
  return state.locale === "ru" ? overviewCardsRu : overviewCards;
}

export function findOverviewCard(slug = "") {
  return activeOverviewCards().find((card) => card.slug === slug) ?? null;
}
