import { t } from "../../core/i18n.mjs";

export function gameContextLabel(game) {
  return game.kind === "friendly" ? t("games.friendlyMatch")
    : `${game.season.name} · ${t("season.roundLabel")} ${game.roundNumber}`;
}
