/**
 * What the built data must contain before anyone is asked to play against it.
 *
 * Step 16.1. The site's rules come out of these files: what a position costs,
 * how many rerolls a team starts with, which medical staff it may hire. When a
 * field goes missing or arrives in the wrong shape, nothing here fails — the
 * page simply renders "-", or a rule quietly answers no. That is how the
 * apothecary bug lived: for a while no Russian coach could hire one, and the
 * build was green the whole time.
 *
 * So the build now refuses to write data it can see is wrong. The checks are
 * deliberately about *shape and presence*, not about the league's rules being
 * correct — a wrong price is a content question, an absent price is this.
 */

/** Fields every team page must carry, and what counts as present. */
const TEAM_META = ["rerolls", "league", "apothecary"];

/**
 * @param {object} data one locale's built data
 * @param {string} locale for the message
 * @returns {string[]} everything wrong, in reading order
 */
export function dataProblems(data, locale) {
  const problems = [];
  const say = (page, message) => problems.push(`${locale}: ${page.id} ${message}`);

  const seen = new Set();
  for (const page of data.pages) {
    if (seen.has(page.id)) problems.push(`${locale}: ${page.id} appears twice`);
    seen.add(page.id);
    if (!page.title) say(page, "has no title");
  }

  for (const page of data.pages.filter((item) => item.kind === "team")) {
    if (!page.team) {
      say(page, "is a team page with no team data");
      continue;
    }
    for (const field of TEAM_META) {
      if (!page.team.meta?.[field]) say(page, `has no ${field} in its meta`);
    }
    if (!Array.isArray(page.team.meta?.apothecaryAccess)) {
      say(page, "has no medical access tokens — the rules read those, not the prose");
    }

    const roster = page.team.roster;
    if (!Array.isArray(roster) || roster.length === 0) {
      say(page, "has no roster rows");
      continue;
    }
    for (const [index, row] of roster.entries()) {
      const where = `roster row ${index + 1}`;
      if (!row.position) say(page, `${where} has no position`);
      if (!row.price) say(page, `${where} (${row.position || "?"}) has no price`);
      if (!row.qty) say(page, `${where} (${row.position || "?"}) has no quantity limit`);
    }
  }

  for (const page of data.pages.filter((item) => item.kind === "starPlayer")) {
    if (!page.starPlayer?.cost) say(page, "is a star player with no cost");
  }

  return problems;
}

/**
 * The same, as a build step: report every problem, then stop.
 *
 * Listing them all matters. A vault edit that breaks one thing usually breaks
 * it in thirty-seven places, and being told about the first one thirty-seven
 * times is how a person learns to run the build less often.
 */
export function assertDataIsUsable(data, locale) {
  const problems = dataProblems(data, locale);
  if (problems.length === 0) return;
  const shown = problems.slice(0, 40);
  const rest = problems.length - shown.length;
  throw new Error(
    `built data for ${locale} is missing things the site reads:\n  ${shown.join("\n  ")}`
    + (rest > 0 ? `\n  ...and ${rest} more` : ""),
  );
}
