import { escapeHtml } from "../../core/dom.mjs";

export const money = value => `${value}k`;
export const safe = escapeHtml;
