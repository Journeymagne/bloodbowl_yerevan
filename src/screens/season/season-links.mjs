/**
 * A pairing's touchdowns and casualties as the 2.x «My games» cards write them: «2 / 1».
 *
 * What is left of the 2.x season screen's formatting (stage 12 removed the screen, its entries and its schedule, and
 * the labels and links they drew). Its last reader is screens/games/my-games.mjs, which stage 09c removes; this file
 * goes with it.
 */
export function pairingTouchdowns(pairing) {
  const home = pairing.homeTouchdowns ?? "-";
  const away = pairing.awayTouchdowns ?? "-";
  return `${home} / ${away}`;
}

export function pairingCasualties(pairing) {
  const home = pairing.homeCasualties ?? "-";
  const away = pairing.awayCasualties ?? "-";
  return `${home} / ${away}`;
}
