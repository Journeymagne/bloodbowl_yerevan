import { t } from "../../core/i18n.mjs";
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { state } from "../../core/state.mjs";
import { gameUrl } from "../../core/routes.mjs";
import { toastError } from "../toast.mjs";

const safe = escapeHtml;
const teamOptions = teams => `<option value="">${t("challenges.chooseTeam")}</option>${teams.map(team => `<option value="${safe(team.id)}">${safe(team.name)}</option>`).join("")}`;

function challengeCard(challenge, incoming, teams) {
  const coach = incoming ? challenge.sender : challenge.recipient;
  return `<article class="challenge-card" data-key="${safe(challenge.id)}"><span class="matchday-eyebrow">${t(incoming ? "challenges.received" : "challenges.sent")}</span><h3>${safe(coach.login)}</h3><p>${safe(challenge.team.name)}</p>
    ${incoming ? `<form data-challenge-accept="${safe(challenge.id)}"><label>${t("challenges.acceptWithTeam")}<select name="teamId" required>${teamOptions(teams)}</select></label><div class="challenge-actions"><button class="primary-button" type="submit" ${!teams.length ? "disabled" : ""}>${t("challenges.accept")}</button><button class="filter-button" type="button" data-challenge-action="decline" data-challenge-id="${safe(challenge.id)}">${t("challenges.decline")}</button></div></form>`
      : `<button class="filter-button" type="button" data-challenge-action="cancel" data-challenge-id="${safe(challenge.id)}">${t("challenges.cancel")}</button>`}</article>`;
}

export function renderChallenges(payload) {
  const ours = state.auth.currentUser.id, pending = payload.challenges.filter(challenge => challenge.status === "pending");
  const incoming = pending.filter(challenge => challenge.recipient.id === ours), outgoing = pending.filter(challenge => challenge.sender.id === ours);
  const answered = payload.challenges.filter(challenge => challenge.status !== "pending").slice(0, 8);
  return `<section class="content-panel challenge-panel"><h2>${t("challenges.title")}</h2><p class="muted-text">${t("games.friendlyRules")}</p>
    ${!payload.teams.length ? `<p class="notice-box">${t("challenges.needTeam")} <a href="#/my-teams">${t("nav.myTeams")}</a></p>` : ""}
    <div class="challenge-columns">${[["challenges.incoming", incoming, true], ["challenges.outgoing", outgoing, false]].map(([title, items, isIncoming]) => `<section><h3 class="challenge-column-heading">${t(title)} <span>${items.length}</span></h3><div class="challenge-list">${items.length ? items.map(item => challengeCard(item, isIncoming, payload.teams)).join("") : `<p class="challenge-empty">${t("challenges.none")}</p>`}</div></section>`).join("")}</div>
    ${answered.length ? `<details class="challenge-history"><summary>${t("challenges.recentResponses")}</summary><ul>${answered.map(item => `<li><span>${safe(item.sender.id === ours ? item.recipient.login : item.sender.login)} · ${t(`challenges.status.${item.status}`)}</span>${item.gameId ? `<a href="${gameUrl(item.gameId)}">${t("challenges.openGame")}</a>` : ""}</li>`).join("")}</ul></details>` : ""}</section>
    <dialog class="matchday-hire-dialog challenge-dialog" data-challenge-dialog aria-labelledby="challenge-dialog-title"><header><div><span class="matchday-eyebrow">${t("games.friendlyMatch")}</span><h2 id="challenge-dialog-title">${t("challenges.send")}</h2></div><button class="filter-button" type="button" data-close-challenge>${t("common.close")}</button></header>
      <form data-challenge-create><p>${t("challenges.sendIntro")}</p><label>${t("challenges.yourTeam")}<select name="teamId" required>${teamOptions(payload.teams)}</select></label><label>${t("challenges.opponent")}<select name="opponentId" required><option value="">${t("challenges.chooseCoach")}</option>${payload.opponents.map(coach => `<option value="${safe(coach.id)}">${safe(coach.login)}</option>`).join("")}</select></label>
      ${!payload.opponents.length ? `<p class="notice-box">${t("challenges.noOpponents")}</p>` : ""}<p class="muted-text">${t("games.noLeaguePoints")}</p><button class="primary-button" type="submit" ${!payload.teams.length || !payload.opponents.length ? "disabled" : ""}>${t("challenges.send")}</button></form></dialog>`;
}

export function mountChallenges(root, refresh) {
  const events = listenerGroup(root);
  let busy = false, dirty = false, disposed = false;
  const mutate = async (path, body, openGame = false) => {
    if (busy) return;
    busy = true;
    const buttons = [...root.querySelectorAll(".challenge-panel button,.challenge-dialog button")];
    const disabled = buttons.map(button => button.disabled); buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
      if (disposed) return;
      state.games.loaded = false; dirty = false;
      root.querySelector("[data-challenge-dialog]")?.close();
      if (openGame && response.gameId) location.hash = gameUrl(response.gameId);
      else await refresh();
    } catch (error) { if (!disposed) toastError(error); }
    finally { busy = false; buttons.forEach((button, index) => { button.disabled = disabled[index]; }); }
  };
  events.on("click", "[data-open-challenge]", () => root.querySelector("[data-challenge-dialog]").showModal());
  events.on("click", "[data-close-challenge]", () => root.querySelector("[data-challenge-dialog]").close());
  events.on("click", "[data-games-refresh]", () => refresh());
  events.on("change", "[data-challenge-accept] select", () => { dirty = true; });
  events.on("click", "[data-challenge-action]", (event, button) => mutate(`/api/challenges/${button.dataset.challengeId}/${button.dataset.challengeAction}`, {}));
  events.on("submit", "[data-challenge-create]", (event, form) => { event.preventDefault(); mutate("/api/challenges", Object.fromEntries(new FormData(form))); });
  events.on("submit", "[data-challenge-accept]", (event, form) => { event.preventDefault(); mutate(`/api/challenges/${form.dataset.challengeAccept}/accept`, Object.fromEntries(new FormData(form)), true); });
  return { canRefresh: () => !busy && !dirty && !root.querySelector("dialog[open]"), cleanup: () => { disposed = true; events.release(); root.querySelector("[data-challenge-dialog]")?.close(); } };
}
