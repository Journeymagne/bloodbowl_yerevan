/**
 * The roster domain, re-exported as one module.
 *
 * Import from here in screens and on the server; import the individual modules
 * only when you need to keep a bundle small or to avoid a cycle.
 *
 * Nothing under src/domain/ may touch the DOM, storage or the network —
 * `npm run check` enforces that.
 */
export * from "./values.mjs";
export * from "./team-rules.mjs";
export * from "./players.mjs";
export * from "./progression.mjs";
export * from "./costs.mjs";
export * from "./validate.mjs";
export { default as LEAGUE_RULES } from "../league-rules.mjs";
