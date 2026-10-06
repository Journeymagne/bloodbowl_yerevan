import { dieValue, matchError, otherSide, SIDES } from "./rules.mjs";
import { journeymanPositions, playerProfile } from "./roster.mjs";
import { categoriesForAccess } from "../roster/values.mjs";
import { prayerEntries } from "./weather.mjs";

export const TARGET_PRAYERS = new Set([3, 4, 5, 6, 7, 8, 16]);

export function effectTargets(preparation, sideName, roll) {
  const targetSide = [6, 7].includes(Number(roll)) ? otherSide(sideName) : sideName;
  const side = preparation[targetSide];
  return [...side.players.filter(player => !player.skipNextGame), ...side.journeymen, ...rookieProfiles(side)];
}

export function validateEffects(preparation, sideName, data) {
  const side = preparation[sideName], effects = side.effects || {};
  const prayers = Number(side.basket["nuffles-prayers"] || 0);
  for (let index = 0; index < prayers; index++) validatePrayer(preparation, sideName, effects.prayers?.[index], data);
  if (side.basket["mark-of-chaos"] && !effectTargets(preparation, sideName, 4).some(player => player.id === effects.markTarget)) throw matchError("MATCH_EFFECTS");
  if (side.basket["rowdy-rookies"]) {
    const rookies = effects.rookies || {};
    if (!dieValue(rookies.first, 3) || !dieValue(rookies.second, 3)
      || !journeymanPositions(side.reference).some(row => row.rowIndex === Number(rookies.rowIndex))) throw matchError("MATCH_EFFECTS");
  }
}

function validatePrayer(preparation, sideName, prayer, data) {
  if (!prayer || !dieValue(prayer.roll, 16)) throw matchError("MATCH_EFFECTS");
  if (!TARGET_PRAYERS.has(Number(prayer.roll))) return;
  const pool = effectTargets(preparation, sideName, prayer.roll), targets = prayer.targets || [];
  const count = Number(prayer.roll) === 6 ? dieValue(prayer.count, 3) : 1;
  if (!count || targets.length !== count || new Set(targets).size !== count || targets.some(id => !pool.some(player => player.id === id))) throw matchError("MATCH_EFFECTS");
  if (Number(prayer.roll) === 16) {
    const player = pool.find(item => item.id === targets[0]);
    const allowed = categoriesForAccess(player.row.primary);
    if (!data.skillGroups.some(group => allowed.includes(group.category) && group.skills.includes(prayer.skill))
      || player.skills.includes(prayer.skill)) throw matchError("MATCH_EFFECTS");
  }
}

export function rookieProfiles(side) {
  if (!side.basket["rowdy-rookies"]) return [];
  const effect = side.effects.rookies || {};
  const row = journeymanPositions(side.reference).find(item => item.rowIndex === Number(effect.rowIndex));
  if (!row || !effect.first || !effect.second) return [];
  const used = new Set([...side.players, ...side.journeymen].map(player => String(player.number)));
  let number = 1;
  return Array.from({ length: Number(effect.first) + Number(effect.second) + 1 }, (_, index) => {
    while (used.has(String(number))) number++;
    used.add(String(number));
    const player = { id: `rookie-${index + 1}`, number: String(number++), name: row.position,
      row, rowIndex: row.rowIndex, temporary: true, kind: "rookie", statMods: {}, extraSkills: [] };
    return { ...playerProfile(player), skills: [...row.skills, "Loner (4+)"] };
  });
}

const MARK_SKILLS = { Undivided: ["Tentacles", "Horns"], Khorne: ["Pile Driver", "Jump Up"],
  Nurgle: ["Disturbing Presence", "Foul Appearance"], Tzeentch: ["Pro", "Two Heads"],
  Slaanesh: ["Dodge", "Leap"], Hashut: ["Iron Hard Skin", "Claws"] };

/** Apply game-only changes to cloned profiles, leaving CTV and saved rosters intact. */
export function applyTemporaryEffects(players, preparation, sideName, data) {
  const result = structuredClone(players), entries = prayerEntries(data);
  for (const origin of SIDES) {
    const side = preparation[origin], count = Number(side.basket["nuffles-prayers"] || 0);
    for (const prayer of (side.effects.prayers || []).slice(0, count)) {
      const roll = Number(prayer.roll), targetSide = [6, 7].includes(roll) ? otherSide(origin) : origin;
      if (targetSide !== sideName) continue;
      for (const player of result.filter(player => player.kind !== "star" && prayer.targets?.includes(player.id))) {
        player.temporaryEffects = [...(player.temporaryEffects || []), entries.find(entry => entry.roll === roll)?.name || String(roll)];
        const skill = ({ 3: "Stab", 5: "Mighty Blow", 6: "Loner (2+)", 8: "Pro", 16: prayer.skill })[roll];
        if (skill) player.skills = [...new Set([...player.skills, skill])];
        if (roll === 4) player.stats.ar = `${Math.min(11, parseInt(player.stats.ar, 10) + 1)}+`;
        if (roll === 7) player.stats.ma = String(Math.max(1, Number(player.stats.ma) - 1));
      }
    }
    if (origin === sideName && side.basket["mark-of-chaos"]) {
      const player = result.find(player => player.id === side.effects.markTarget && player.kind !== "star");
      if (player) { player.skills = [...new Set([...player.skills, ...(MARK_SKILLS[side.roster.favouredChoice] || [])])]; player.temporaryEffects = [...(player.temporaryEffects || []), "Mark of Chaos"]; }
    }
  }
  return result;
}
