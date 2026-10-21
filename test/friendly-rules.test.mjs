/**
 * The league keeps no friendly limit (owner, stage 09c): the site counts none, so the rules it shows say
 * none, in the vault of either language and in the rules' overview cards. A limit back in the rules is a
 * rule the code does not keep, so it is a question for the owner, not a sentence to merge as is.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { overviewCards } from "../src/data/overview-cards-en.mjs";
import { overviewCardsRu } from "../src/data/overview-cards-ru.mjs";

const data = (locale) => JSON.parse(readFileSync(new URL(`../public/data.${locale}.json`, import.meta.url), "utf8"));

const LANGUAGES = [
  { locale: "en", cards: overviewCards, limit: /friendly match limit|games per month/i, offSeason: "Off-season: Friendly matches that can be played at any time, provided the team is not currently participating in another event." },
  { locale: "ru", cards: overviewCardsRu, limit: /лимит товарищеских|игр в месяц/i, offSeason: "Межсезонье: Товарищеские матчи, которые можно сыграть в любое время, при условии что команда в данный момент не участвует в другом мероприятии." },
];

const cardLines = (cards) => cards.flatMap((card) => [card.summary, ...card.sections.flatMap((section) => [section.title, ...section.items])]);

for (const { locale, cards, limit, offSeason } of LANGUAGES) {
  test(`the rules set no friendly limit (${locale}): no page of the vault and no overview card names one`, () => {
    const pages = data(locale).pages.filter((page) => limit.test(page.body));
    assert.deepEqual(pages.map((page) => page.path), []);
    assert.deepEqual(cardLines(cards).filter((line) => limit.test(line)), []);
  });

  test(`the off-season's friendlies are still in the match procedures (${locale}), only the limit is gone`, () => {
    const procedures = data(locale).pages.find((page) => page.slug === "rules/4-match-procedures");
    assert.ok(procedures?.body.includes(offSeason), "the off-season paragraph is kept");
  });
}
