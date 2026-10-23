import { rollDie, rollDice, record, direction } from "./model.mjs";

export const scatterOffsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const conditions = {
  2: ["leaves", "Leaf-Strewn Pitch", "Armour rolls suffer −1."],
  3: ["chill", "Autumn Chill", "KO recovery needs 5+."],
  11: ["rain", "Pouring Rain", "Pick-up and catch tests suffer −1."],
  12: ["wind", "Strong Wind", "Kick deviation uses the wind template and D8 distance."],
};

export function setWeather(s, total) {
  const [id, name, detail] = conditions[total] || ["normal", "Perfect Conditions", "No weather modifiers."];
  s.weather = { id, name, detail, season: "Autumn" };
  record(s, `Autumn weather: ${name}. ${detail}`, "info");
}

export function pregameWeather(s, random) {
  const home = rollDie(s, random, "Weather · home", 6, { chooser: 0 });
  const away = rollDie(s, random, "Weather · away", 6, { chooser: 1 });
  setWeather(s, home + away);
}

export function changedWeather(s, random) {
  const result = rollDie(s, random, "Changing Weather", 6, { chooser: s.drive.receiver });
  setWeather(s, [2, 3, 4, 4, 11, 12][result - 1]);
  if (s.weather.id === "normal") {
    for (let i = 0; i < 3; i++) {
      const [dx, dy] = scatterOffsets[rollDie(s, random, `Weather scatter ${i + 1}`, 8, { chooser: s.drive.kicker }) - 1];
      s.drive.landing.x += dx; s.drive.landing.y += dy;
    }
  }
}

export function kickDeviation(s, random) {
  let dx, dy, length;
  const options = { chooser: s.drive.kicker };
  if (s.weather.id === "wind") {
    const wind = rollDie(s, random, "Wind direction", 8, options);
    const forward = direction(s, s.drive.kicker);
    const base = wind <= 2 ? [-forward, 0] : wind <= 4 ? [forward, 0] : wind <= 6 ? [0, -forward] : [0, forward];
    const branch = rollDie(s, random, "Wind throw-in template", 6, options);
    const shift = branch <= 2 ? -1 : branch <= 4 ? 0 : 1;
    [dx, dy] = [base[0] - shift * base[1], base[1] + shift * base[0]];
    length = rollDie(s, random, "Wind distance", 8, options);
  } else {
    [dx, dy] = scatterOffsets[rollDie(s, random, "Kick direction", 8, options) - 1];
    length = Math.floor(rollDie(s, random, "GATA kick distance", 6, options) / 2);
  }
  s.drive.landing = { x: s.drive.target.x + dx * length, y: s.drive.target.y + dy * length };
  record(s, `Kick deviates ${length} squares. The ball remains in the air until the kickoff event is resolved.`);
}

export function randomOnPitch(s, random, players, label, side) {
  if (!players.length) return null;
  const value = rollDice(s, random, label, { count: 1, sides: players.length, kind: "number", chooser: side,
    detail: players.map((p, i) => `${i + 1}: #${p.number} ${p.name}`).join(" · ") })[0];
  return players[value - 1];
}
