// Recipes of the UI v2 polish part 1 preview: copy to the scratchpad and replace them with the new PR's.
// The same file runs in both checkouts. A recipe uses only what both have, or asks `branch` and draws the other
// side's equivalent (or a note that it is not there). Every word comes from `t`, each side's own dictionary.
export async function fragments({ load, state, t, branch }) {
  const { manageMarkup, manageModel } = await load("src/screens/team/manage/index.mjs");
  const { shutOpener } = await load("src/screens/team/manage/strip.mjs");
  const { renderSkillChips } = await load("src/ui/skill-chip.mjs");
  const { icon } = await load("src/ui/icons.mjs");

  // The fixture team of test/team-manage.test.mjs: the same data on both sides.
  const team = {
    id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active", inActiveSeason: true,
    roster: { treasury: 70, coachesSafe: 20, startingRerolls: 2, teamRerolls: 1, assistantCoaches: 1, players: [] },
  };
  const day = "2026-10-18T12:00:00Z";
  const line = (id, extra = {}) => ({ id, kind: "match_income", delta: 60, balanceAfter: 130, reason: null, note: null, pairingId: null, createdAt: day, ...extra });
  const entries = [line("l4"), line("l3", { kind: "manual", reason: "sponsor", delta: 10 }), line("l2", { kind: "staff", delta: -50 }), line("l1", { kind: "safe", delta: -20 })];
  const ledger = { entries, next: null, since: "2026-10-01T12:00:00Z", total: entries.length, loaded: true, loading: false, error: "" };
  const season = { season: { id: "s1", name: "Mock Season", currentRound: 7 }, standings: [{ team: { id: "t1" }, rank: 1, points: 9 }] };
  const race = (state.data.teams ?? []).find((item) => item.slug === team.baseTeamSlug) ?? null;
  const page = (phone) => manageMarkup(manageModel({ team, race, seasonData: season, games: [], ledger, phone }));

  // Words in each side's own form: a renamed word shows renamed.
  const sources = { base: t("teamRoster.source.base"), primary: t("teamAdvance.typeShort.primary"), captain: t("teamRoster.source.captain") };
  const skills = [{ name: "Block", source: sources.base }, { name: "Dodge", gained: true, source: sources.primary }, { name: "Leader", captain: true, source: sources.captain }];
  const label = (text) => `<p class="g-preview-label">${text}</p>`;

  return {
    // A whole screen through its own markup function: the change in its place.
    teamDesk: () => page(false),
    teamPhone: () => page(true),
    // A function is called later, and one that throws becomes a note instead of stopping the others.
    chips: () => renderSkillChips({ skills }) + renderSkillChips({ skills, card: true }),
    // Markup inside a sheet needs the sheet's id around it (its rules are scoped by it), and the change needs what is
    // around it to be judged: the field above, and the other place it now matches, each named by a label.
    fixLine: () => {
      const fix = branch
        ? `<button type="button" class="g-link-btn">${t("teamPlayer.fix.open")}</button>`
        : `<button type="button" class="g-player-edit__fix"><span class="g-player-edit__fixwords">${t("teamPlayer.fix.open")}</span>${icon("chevron", 16)}</button>`;
      const correct = shutOpener(branch ? "g-manage__fix g-link-btn" : "g-manage__fix", 'data-treasury-fix="t1"', t("treasury.fix.open"), false);
      return `${label("A player's edit, its last line")}<div id="player-edit"><div class="g-preview-col">`
        + `<label class="g-field"><span class="g-field__label">${t("teamPlayer.edit.name")}</span><input class="g-field__input" value="Ashby"></label>${fix}</div></div>`
        + `${label("The team page, under Coach's Safe")}<div class="g-preview-col">${correct}</div>`;
    },
    // Something only the branch has: the other side says where it lives there.
    rule: () => (branch ? "<p>…the branch's markup…</p>" : `<p class="g-preview-none">Not on main: the rule is read in the skill's own sheet.</p>`),
  };
}
