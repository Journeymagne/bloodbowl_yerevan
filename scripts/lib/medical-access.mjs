/**
 * Which medical staff a team may hire, as tokens rather than a sentence.
 *
 * The prose is translated; the rule is not. The Russian vault says one Russian
 * word where the English says "Available" — the same thing to a coach, and
 * nothing at all to a regular expression. That is why a Russian coach could not
 * hire an apothecary at all: the client matched English words against a
 * translated string (step 16.1).
 *
 * So the tokens are derived once from the English vault and copied onto the
 * Russian pages by identifier, the direction every other fact here travels.
 */
const MEDICAL_ACCESS = [
  ["apothecary", /\bavailable\b/i],
  ["mortuary", /mortuary\s+assistant/i],
  ["plague", /plague\s+doctor/i],
];

/** @param {string} text the English apothecary line @returns {string[]} tokens */
export function medicalAccessFrom(text = "") {
  return MEDICAL_ACCESS.filter(([, pattern]) => pattern.test(String(text))).map(([token]) => token);
}

/** Every team page's tokens, keyed by page id, read out of built English data. */
export function medicalAccessByPageId(data) {
  return new Map(
    data.pages
      .filter((page) => page.kind === "team" && page.team)
      .map((page) => [page.id, medicalAccessFrom(page.team.meta?.apothecary)]),
  );
}

/** Put those tokens on every team page of `data`, whatever its language. */
export function applyMedicalAccess(data, tokensById) {
  for (const page of data.pages) {
    if (page.kind !== "team" || !page.team) continue;
    page.team.meta = { ...page.team.meta, apothecaryAccess: tokensById.get(page.id) ?? [] };
  }
}
