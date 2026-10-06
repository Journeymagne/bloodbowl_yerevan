import { MATCH_RULES, SIDES, CONFIRM_ACTION, matchError, dieValue } from "./rules.mjs";
import { createMatchSide, addJourneyman, calculateMatchCtv, validateMatchPositions } from "./roster.mjs";
import { matchBudget, validateBasket } from "./budget.mjs";
import { validateEffects } from "./effects.mjs";

export function createPreparation(sources, data) {
  return { revision: 1, rules: MATCH_RULES, status: "preparing", startedAt: null,
    weather: { season: "Autumn", home: null, away: null },
    home: createMatchSide(sources.home, data), away: createMatchSide(sources.away, data), history: [] };
}

export function preparationStep(preparation) {
  if (!SIDES.every(side => preparation[side].fansRoll)) return 0;
  if (!preparation.weather.home || !preparation.weather.away) return 1;
  if (!SIDES.every(side => preparation[side].rosterLocked)) return 2;
  if (!SIDES.every(side => preparation[side].basketLocked)) return 3;
  return 4;
}

/** Keep existing drafts while applying revised league policy; started match sheets stay sealed. */
export function upgradePreparation(current) {
  if (current.status === "in_progress" || current.rules?.version === MATCH_RULES.version) return current;
  const next = structuredClone(current);
  next.rules = MATCH_RULES; next.revision++; next.status = "preparing";
  delete next.kickoff;
  for (const side of SIDES) next[side].confirmed = false;
  return next;
}

function rosterAction(preparation, sideName, action) {
  const side = preparation[sideName];
  if (action.type === "reopen") {
    for (const name of SIDES) { preparation[name].basketLocked = false; preparation[name].basket = {}; preparation[name].effects = {}; }
    side.rosterLocked = false;
    return;
  }
  if (side.rosterLocked) throw matchError("MATCH_LOCKED");
  if (action.type === "add-journeyman") side.journeymen.push(addJourneyman(side, action.rowIndex));
  if (action.type === "remove-journeyman") side.journeymen = side.journeymen.filter(player => player.id !== action.id);
  if (action.type === "lock-roster") {
    validateMatchPositions(side);
    if (calculateMatchCtv(side).players > MATCH_RULES.rosterMaximum) throw matchError("MATCH_ROSTER_LIMIT", { maximum: MATCH_RULES.rosterMaximum });
    side.rosterLocked = true;
  }
}

function basketAction(preparation, sideName, action, data) {
  const side = preparation[sideName];
  if (!matchBudget(preparation, sideName, data).canChoose) throw matchError("MATCH_WAIT");
  if (side.basketLocked) throw matchError("MATCH_LOCKED");
  if (action.type === "basket") {
    const quantity = Number(action.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) throw matchError("MATCH_PURCHASE", { item: action.id });
    side.basket[String(action.id)] = quantity;
    validateBasket(preparation, sideName, data);
  }
  if (action.type === "effects") {
    if (!action.effects || typeof action.effects !== "object" || Array.isArray(action.effects)) throw matchError("MATCH_EFFECTS");
    if (action.effects.prayers !== undefined && (!Array.isArray(action.effects.prayers) || action.effects.prayers.some(prayer => !prayer || !Array.isArray(prayer.targets)))) throw matchError("MATCH_EFFECTS");
    side.effects = action.effects;
  }
  if (action.type === "lock-basket") {
    validateBasket(preparation, sideName, data); validateEffects(preparation, sideName, data);
    side.basketLocked = true;
  }
}

export function applyPreparationAction(current, sideName, action, data, actor = "") {
  const preparation = structuredClone(current), step = preparationStep(preparation);
  if (!SIDES.includes(sideName)) throw matchError("FIXTURE_NOT_YOURS");
  if (preparation.status === "in_progress") throw matchError("MATCH_STARTED");
  const type = action.type;
  const supported = ["fans", "weather", "reopen", "add-journeyman", "remove-journeyman", "lock-roster", "basket", "effects", "lock-basket", CONFIRM_ACTION];
  if (!supported.includes(type)) throw matchError("MATCH_ACTION");
  if (type !== CONFIRM_ACTION) for (const side of SIDES) preparation[side].confirmed = false;
  if (type === "fans") preparation[sideName].fansRoll = dieValue(action.value, 3);
  else if (type === "weather") {
    if (step < 1 || !["Spring", "Summer", "Autumn"].includes(action.season)) throw matchError("MATCH_WAIT");
    preparation.weather = { season: action.season, home: dieValue(action.home, 6), away: dieValue(action.away, 6) };
  } else if (["reopen", "add-journeyman", "remove-journeyman", "lock-roster"].includes(type)) {
    if (step < 2 && type !== "reopen") throw matchError("MATCH_WAIT");
    rosterAction(preparation, sideName, action);
  } else if (["basket", "effects", "lock-basket"].includes(type)) basketAction(preparation, sideName, action, data);
  else if (type === CONFIRM_ACTION) {
    if (step < 4) throw matchError("MATCH_WAIT");
    preparation[sideName].confirmed = true;
  }
  preparation.status = SIDES.every(side => preparation[side].confirmed) ? "ready" : "preparing";
  preparation.revision++;
  preparation.history = [...preparation.history, { type, side: sideName, actor }].slice(-100);
  return preparation;
}

export function resetChangedRosters(current, sources, data) {
  const fresh = createPreparation(sources, data);
  fresh.revision = current.revision + 1;
  fresh.home.fansRoll = current.home.fansRoll; fresh.away.fansRoll = current.away.fansRoll;
  fresh.weather = current.weather;
  fresh.history = [...current.history, { type: "roster-changed" }].slice(-100);
  return fresh;
}
