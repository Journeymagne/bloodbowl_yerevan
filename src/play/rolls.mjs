import { displayRoll, getPlayer, record } from "./model.mjs";

// A command is replayed from its checkpoint using only confirmed dice. Pausing
// carries plain JSON, so local play, SSE reconnects and the server use the same
// continuation. No future roll is generated until its coach confirms it.
class AwaitRoll extends Error {
  constructor(request) { super("Awaiting a roll"); this.request = request; }
}

export function rollPassed(request, values) {
  if (!request.target || !values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return request.count === 1 ? total === 6 || (total !== 1 && total >= request.target) : total >= request.target;
}

export function rerollOptions(s) {
  const p = s.pending;
  if (p?.type !== "roll" || p.stage !== "result" || p.entry.reroll) return [];
  const { request, entry } = p, player = getPlayer(s, request.player);
  const options = [];
  if (request.skill && player?.skills.includes(request.skill) && rollPassed(request, entry.values) === false
    && !(request.skill === "Dodge" && player.dodgeUsed)) options.push(request.skill);
  if (s.phase === "play" && request.teamReroll && request.chooser === s.active && !s.rerollUsed
    && s.rerolls[s.active] + (s.driveRerolls?.[s.active] || 0) > 0) options.push("Team");
  return options;
}

function spendReroll(s, request, source) {
  if (source === "Team") {
    if (s.driveRerolls?.[s.active] > 0) s.driveRerolls[s.active]--;
    else s.rerolls[s.active]--;
    s.rerollUsed = true;
  }
  else if (source === "Dodge") getPlayer(s, request.player).dodgeUsed = true;
  record(s, `${source} reroll used.`, "dice");
}

function replayRolls(transaction, execute) {
  const s = structuredClone(transaction.base);
  let cursor = 0;
  const replay = () => { throw new Error("All random rolls must use the dice tray."); };
  replay.roll = (state, request) => {
    const entry = transaction.results[cursor++];
    if (!entry) throw new AwaitRoll(request);
    if (entry.label !== request.label || entry.values.length !== request.count) throw new Error("Invalid roll continuation.");
    displayRoll(state, request, entry.values);
    if (!entry.reroll) return entry.values;
    spendReroll(state, request, entry.reroll.source);
    displayRoll(state, request, entry.reroll.values, entry.reroll.source);
    return entry.reroll.values;
  };
  try { execute(s, transaction.command, replay); }
  catch (error) {
    if (!(error instanceof AwaitRoll)) throw error;
    s.pending = { type: "roll", stage: "ready", chooser: error.request.chooser,
      request: error.request, entry: { label: error.request.label, values: [], reroll: null }, transaction };
    s.notice = `${error.request.label}: confirm the roll in the dice tray.`;
  }
  s.log = [...s.log, ...transaction.chat].slice(-100);
  return s;
}

function confirmDice(s, random) {
  const p = s.pending;
  if (!["ready", "reroll-ready"].includes(p.stage)) throw new Error("This roll has already been thrown.");
  const values = Array.from({ length: p.request.count }, () => Math.floor(random() * p.request.sides) + 1);
  if (p.stage === "reroll-ready") {
    spendReroll(s, p.request, p.source);
    p.entry.reroll = { source: p.source, values };
  } else p.entry.values = values;
  displayRoll(s, p.request, values, p.stage === "reroll-ready" ? p.source : null);
  p.stage = "result";
  s.notice = `${p.request.label}: review the dice, then confirm the result.`;
}

function continueDice(state, cmd, random, execute) {
  const s = structuredClone(state), p = s.pending;
  if (cmd.type === "confirmRoll") confirmDice(s, random);
  else if (cmd.type === "selectReroll") {
    if (!rerollOptions(s).includes(cmd.source)) throw new Error("That reroll is not available.");
    p.source = cmd.source; p.stage = "reroll-ready";
  } else if (cmd.type === "cancelReroll") {
    if (p.stage !== "reroll-ready") throw new Error("No reroll is awaiting confirmation.");
    p.stage = "result"; delete p.source;
  } else if (cmd.type === "acceptRoll") {
    if (p.stage !== "result") throw new Error("Roll the dice before accepting the result.");
    p.transaction.results.push(p.entry);
    return replayRolls(p.transaction, execute);
  } else throw new Error("Resolve the dice tray before continuing.");
  return s;
}

export function withDiceTray(state, cmd, random, execute) {
  const next = state.pending?.type === "roll" ? continueDice(state, cmd, random, execute)
    : replayRolls({ base: structuredClone(state), command: structuredClone(cmd), results: [], chat: [] }, execute);
  next.version = state.version + 1;
  return next;
}
