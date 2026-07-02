import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = path.join(rootDir, "content", process.env.SITE_CONTENT_DIR || "Gata");
const publicDir = path.join(rootDir, "public");
const dataPath = path.join(publicDir, "data.json");

const sectionLabels = new Map([
  ["Teams", "Teams"],
  ["Skills", "Skills"],
  ["Traits", "Traits"],
  ["Rules", "Rules"],
  ["Cheatsheets", "Cheatsheets"],
  ["Inducements", "Inducements"],
  ["Star Players", "Star Players"],
  ["General Information", "General Information"],
  ["РљРѕРјР°РЅРґС‹", "РљРѕРјР°РЅРґС‹"],
  ["Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ", "Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ РєРѕРјР°РЅРґС‹"],
  ["РќР°РІС‹РєРё", "РќР°РІС‹РєРё"],
  ["РЎРІРѕР№СЃС‚РІР°", "РЎРІРѕР№СЃС‚РІР°"],
  ["Р РµРіР»Р°РјРµРЅС‚", "Р РµРіР»Р°РјРµРЅС‚"],
  ["РџР°РјСЏС‚РєР°", "РџР°РјСЏС‚РєР°"],
  ["РџРѕРѕС‰СЂРµРЅРёСЏ", "РџРѕРѕС‰СЂРµРЅРёСЏ"],
  ["Р—РІРµР·РґРЅС‹Рµ РёРіСЂРѕРєРё", "Р—РІРµР·РґРЅС‹Рµ РёРіСЂРѕРєРё"],
]);

const skillCategories = ["Agility", "Devious", "General", "Mutation", "Passing", "Strength"];
const virtualLinks = new Map([
  ["Team List", "#/teams"],
  ["Teams", "#/teams"],
  ["РЎРїРёСЃРѕРє РєРѕРјР°РЅРґ", "#/teams"],
]);

const cyrillicMap = new Map();

function transliterate(value) {
  return [...value].map((char) => cyrillicMap.get(char.toLowerCase()) ?? char).join("");
}

function slugify(value) {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPublicAssetPath(relativePath) {
  return `public/vault-assets/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function stripFormatting(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const canonicalLabels = new Map(Object.entries({
  "big guy": "Big Guy",
  biltzer: "Blitzer",
  blitzer: "Blitzer",
  bonehead: "Bone Head",
  "foul apearance": "Foul Appearance",
  "foul appearance": "Foul Appearance",
  "side step": "Sidestep",
  sidestep: "Sidestep",
  "thick skull": "Thick Skull",
  "thick skull": "Thick Skull",
  trall: "Thrall",
  squirell: "Squirrel",
  "unchanneled fury": "Unchanneled Fury",
  "unchannelled fury": "Unchanneled Fury",
  "worlds edge superleague": "World's Edge Superleague",
}));

function canonicalLabel(value = "") {
  const clean = stripFormatting(value);
  return canonicalLabels.get(clean.toLowerCase()) ?? clean;
}

function normalizeCost(value = "") {
  const clean = stripFormatting(value);
  return clean.replace(/^(\d+)\s*k$/i, "$1K");
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    return { body: markdown, tags: [] };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { body: markdown, tags: [] };
  }

  const frontmatter = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).trimStart();
  const tags = [];
  let inTags = false;

  for (const line of frontmatter.split(/\r?\n/)) {
    if (/^tags\s*:/.test(line)) {
      inTags = true;
      const inlineTags = line.split(":").slice(1).join(":").trim();
      if (inlineTags) {
        tags.push(...inlineTags.split(",").map((tag) => tag.trim()).filter(Boolean));
      }
      continue;
    }

    if (inTags && /^\s*-\s+/.test(line)) {
      tags.push(line.replace(/^\s*-\s+/, "").trim());
      continue;
    }

    if (line.trim() && !/^\s/.test(line)) {
      inTags = false;
    }
  }

  return { body, tags: tags.map(canonicalLabel) };
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let wikiDepth = 0;

  for (let index = 0; index < trimmed.length; index += 1) {
    const pair = trimmed.slice(index, index + 2);

    if (pair === "[[") {
      wikiDepth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "]]" && wikiDepth > 0) {
      wikiDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }

    if (trimmed[index] === "|" && wikiDepth === 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += trimmed[index];
  }

  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

function parseMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|") || !lines[index + 1]?.trim().startsWith("|")) {
      continue;
    }

    const header = splitTableRow(lines[index]);
    const separator = splitTableRow(lines[index + 1]);
    if (!isSeparatorRow(separator)) {
      continue;
    }

    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
      const cells = splitTableRow(lines[cursor]);
      rows.push(Object.fromEntries(header.map((name, cellIndex) => [stripFormatting(name), cells[cellIndex] ?? ""])));
      cursor += 1;
    }

    tables.push({ header: header.map(stripFormatting), rows });
    index = cursor - 1;
  }

  return tables;
}

function autoLinkKnownTerms(html, pageByTitle) {
  if (html.includes("<a ")) {
    return html;
  }

  const entities = [...pageByTitle.values()]
    .filter((page) => page.kind === "skill" || page.kind === "trait")
    .sort((a, b) => b.title.length - a.title.length);

  let linked = html;
  for (const page of entities) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(escapeHtml(page.title))})(?=$|[^A-Za-z0-9])`, "gi");
    linked = linked
      .split(/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/gi)
      .map((part) => {
        if (part.startsWith("<")) {
          return part;
        }
        return part.replace(pattern, (_match, prefix, label) => `${prefix}<a href="#/${page.slug}">${label}</a>`);
      })
      .join("");
  }

  return linked;
}

function resolveLinkedPage(pageByTitle, title) {
  const direct = pageByTitle.get(title);
  if (direct) return direct;

  const lowerTitle = title.toLowerCase();
  const caseMatch = [...pageByTitle.values()].find((page) => page.title.toLowerCase() === lowerTitle);
  if (caseMatch) return caseMatch;

  const trimmedDots = title.replace(/\.+$/g, "");
  if (trimmedDots !== title) {
    const dotMatch = pageByTitle.get(trimmedDots)
      || [...pageByTitle.values()].find((page) => page.title.toLowerCase() === trimmedDots.toLowerCase());
    if (dotMatch) return dotMatch;
  }

  const alias = title
    .replace(/^Loner\s*\([^)]+\)$/i, "Loner (X+)")
    .replace(/^Hatred\s*\([^)]+\)$/i, "Hatred (X)")
    .replace(/^Animosity\s*\([^)]+\)$/i, "Animosity (X)")
    .replace(/^Bloodlust\s*\([^)]+\)$/i, "Bloodlust (X+)");

  return alias !== title ? pageByTitle.get(alias) : undefined;
}

function inlineMarkdownToHtml(value, pageByTitle, options = {}) {
  let html = escapeHtml(value);

  html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const imageSrc = /^https?:\/\//i.test(src) ? src : toPublicAssetPath(src);
    return `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}">`;
  });
  html = html.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
    const title = target.trim();
    const virtualHref = virtualLinks.get(title);
    if (virtualHref) {
      return `<a href="${virtualHref}">${escapeHtml((alias || title).trim())}</a>`;
    }
    const page = resolveLinkedPage(pageByTitle, title);
    const label = escapeHtml((alias || title).trim());
    if (!page) {
      return `<span class="missing-link">${label}</span>`;
    }
    return `<a href="#/${page.slug}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  if (options.autoLinkKnown) {
    html = autoLinkKnownTerms(html, pageByTitle);
  }
  return html;
}

function splitInlineNumberedItems(value) {
  const markerPattern = /(^|\s)(\d{1,2})\.\s+/g;
  const markers = [];
  let match;

  while ((match = markerPattern.exec(value)) !== null) {
    markers.push({
      number: Number.parseInt(match[2], 10),
      markerStart: match.index + match[1].length,
      contentStart: match.index + match[0].length,
    });
  }

  if (markers.length < 2 || markers[0].number !== 1 || markers[1].number !== 2) {
    return null;
  }

  const lead = value.slice(0, markers[0].markerStart).trim();
  const items = markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    return value.slice(marker.contentStart, nextMarker?.markerStart ?? value.length).trim();
  }).filter(Boolean);

  return items.length >= 2 ? { lead, start: markers[0].number, items } : null;
}

function renderNumberedList(items, pageByTitle, start = 1) {
  const startAttr = start > 1 ? ` start="${start}"` : "";
  return [
    `<ol class="numbered-list"${startAttr}>`,
    ...items.map((item) => `<li>${inlineMarkdownToHtml(item, pageByTitle)}</li>`),
    "</ol>",
  ].join("\n");
}

function markdownToHtml(markdown, pageByTitle) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listType = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const text = paragraph.join(" ");
      const numberedItems = splitInlineNumberedItems(text);
      if (numberedItems) {
        if (numberedItems.lead) {
          html.push(`<p>${inlineMarkdownToHtml(numberedItems.lead, pageByTitle)}</p>`);
        }
        html.push(renderNumberedList(numberedItems.items, pageByTitle, numberedItems.start));
      } else {
        html.push(`<p>${inlineMarkdownToHtml(text, pageByTitle)}</p>`);
      }
      paragraph = [];
    }
  };

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type, start) => {
    if (listType !== type) {
      closeList();
      const startAttr = type === "ol" && start > 1 ? ` start="${start}"` : "";
      const classAttr = type === "ol" ? " class=\"numbered-list\"" : "";
      html.push(`<${type}${classAttr}${startAttr}>`);
      listType = type;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    if (trimmed.startsWith("|") && lines[index + 1]?.trim().startsWith("|")) {
      const header = splitTableRow(lines[index]);
      const headerLabels = header.map(stripFormatting);
      const separator = splitTableRow(lines[index + 1]);
      if (isSeparatorRow(separator)) {
        flushParagraph();
        closeList();
        const tableClass = headerLabels[0] === "#" ? " class=\"numbered-table\"" : "";
        html.push(`<div class="table-scroll"><table${tableClass}><thead><tr>`);
        html.push(header.map((cell) => `<th>${inlineMarkdownToHtml(cell, pageByTitle)}</th>`).join(""));
        html.push("</tr></thead><tbody>");
        index += 2;
        while (index < lines.length && lines[index].trim().startsWith("|")) {
          html.push("<tr>");
          html.push(splitTableRow(lines[index]).map((cell, cellIndex) => {
            const headerLabel = headerLabels[cellIndex] ?? "";
            const autoLinkKnown = headerLabel !== "Position" && headerLabel !== "\u041f\u043e\u0437\u0438\u0446\u0438\u044f";
            return `<td>${inlineMarkdownToHtml(cell, pageByTitle, { autoLinkKnown })}</td>`;
          }).join(""));
          html.push("</tr>");
          index += 1;
        }
        html.push("</tbody></table></div>");
        index -= 1;
        continue;
      }
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 5);
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2], pageByTitle)}</h${level}>`);
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      openList("ul");
      html.push(`<li>${inlineMarkdownToHtml(listItem[1], pageByTitle)}</li>`);
      continue;
    }

    const orderedListItem = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedListItem) {
      flushParagraph();
      openList("ol", Number.parseInt(orderedListItem[1], 10));
      html.push(`<li>${inlineMarkdownToHtml(orderedListItem[2], pageByTitle)}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html.join("\n");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  let allowedStarFiles = null;

  if (path.basename(dir) === "Star Players" || path.basename(dir) === "Р—РІРµР·РґРЅС‹Рµ РёРіСЂРѕРєРё") {
    try {
      const index = JSON.parse(await fs.readFile(path.join(dir, "_index.json"), "utf8"));
      allowedStarFiles = new Set(index.files || []);
    } catch {
      allowedStarFiles = null;
    }
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".obsidian") {
        continue;
      }
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      if (allowedStarFiles && !allowedStarFiles.has(entry.name.toLowerCase())) {
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

function getSection(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts[0] === "Teams") {
    return "Teams";
  }
  if (parts[0] === "Skills and Traits" && (parts[1] === "Skills" || parts[1] === "Traits")) {
    return parts[1];
  }
  if (parts[0] === "Skills and Traits") {
    return "Skills and Traits";
  }
  if (["Rules", "Cheatsheets", "Inducements", "Star Players", "General Information"].includes(parts[0])) {
    return parts[0];
  }
  if (parts[0] === "РљРѕРјР°РЅРґС‹" && parts[1] === "Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ") {
    return "Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ";
  }
  if (parts[0] === "РќР°РІС‹РєРё Рё СЃРІРѕР№СЃС‚РІР°" && (parts[1] === "РќР°РІС‹РєРё" || parts[1] === "РЎРІРѕР№СЃС‚РІР°")) {
    return parts[1];
  }
  if (parts[0] === "РќР°РІС‹РєРё Рё СЃРІРѕР№СЃС‚РІР°") {
    return "РќР°РІС‹РєРё Рё СЃРІРѕР№СЃС‚РІР°";
  }
  return parts[0] || "General Information";
}

function getKind(section) {
  if (section === "Teams") return "team";
  if (section === "Skills") return "skill";
  if (section === "Traits") return "trait";
  if (section === "Rules") return "rules";
  if (section === "Cheatsheets") return "cheatsheet";
  if (section === "Inducements") return "inducement";
  if (section === "Star Players") return "starPlayer";
  if (section === "РљРѕРјР°РЅРґС‹" || section === "Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ") return "team";
  if (section === "РќР°РІС‹РєРё") return "skill";
  if (section === "РЎРІРѕР№СЃС‚РІР°") return "trait";
  if (section === "Р РµРіР»Р°РјРµРЅС‚") return "rules";
  if (section === "РџР°РјСЏС‚РєР°") return "cheatsheet";
  if (section === "РџРѕРѕС‰СЂРµРЅРёСЏ") return "inducement";
  if (section === "Р—РІРµР·РґРЅС‹Рµ РёРіСЂРѕРєРё") return "starPlayer";
  return "page";
}

function extractTeamMeta(markdown) {
  const meta = {};
  const patterns = [
    ["rerolls", /\*\*Rerolls:\*\*\s*([^\n]+)/i],
    ["apothecary", /\*\*Apothecary:\*\*\s*([^\n]+)/i],
    ["league", /\*\*League:\*\*\s*([^\n]+)/i],
    ["specialRules", /\*\*Special Rules:\*\*\s*([^\n]+)/i],
    ["rerolls", /\*\*РџРµСЂРµР±СЂРѕСЃС‹:\*\*\s*([^\n]+)/i],
    ["apothecary", /\*\*РђРїРѕС‚РµРєР°СЂРёР№:\*\*\s*([^\n]+)/i],
    ["league", /\*\*Р›РёРіР°:\*\*\s*([^\n]+)/i],
    ["specialRules", /\*\*РЎРїРµС†РёР°Р»СЊРЅС‹Рµ РїСЂР°РІРёР»Р°:\*\*\s*([^\n]+)/i],
  ];

  for (const [key, pattern] of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      meta[key] = key === "cost" ? normalizeCost(match[1]) : stripFormatting(match[1]);
    }
  }

  return meta;
}

function extractStarPlayerMeta(markdown) {
  const meta = {};
  const patterns = [
    ["availability", /\*\*Availability:\*\*\s*([^\n]+)/i],
    ["cost", /\*\*Cost:\*\*\s*([^\n]+)/i],
    ["teams", /\*\*Teams:\*\*\s*([^\n]+)/i],
    ["availability", /\*\*Р”РѕСЃС‚СѓРїРЅРѕСЃС‚СЊ:\*\*\s*([^\n]+)/i],
    ["cost", /\*\*Р¦РµРЅР°:\*\*\s*([^\n]+)/i],
    ["teams", /\*\*РљРѕРјР°РЅРґС‹:\*\*\s*([^\n]+)/i],
  ];

  for (const [key, pattern] of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      meta[key] = key === "cost" ? normalizeCost(match[1]) : stripFormatting(match[1]);
    }
  }

  return meta;
}

function parseSkillGroups(pages) {
  const tablePage = pages.find((page) => page.title === "Skill Table" || page.title === "РўР°Р±Р»РёС†Р° РЅР°РІС‹РєРѕРІ");
  if (!tablePage) {
    return [];
  }

  const tables = parseMarkdownTables(tablePage.body);
  const first = tables[0];
  if (!first) {
    return [];
  }

  return skillCategories.map((category) => ({
    category,
    skills: first.rows
      .map((row) => stripFormatting(row[category] || ""))
      .filter(Boolean),
  }));
}

function splitListCell(value) {
  return stripFormatting(value.replace(/<br\s*\/?>/gi, ","))
    .split(",")
    .map((item) => canonicalLabel(item))
    .filter(Boolean);
}

const files = await walk(vaultDir);
const rawPages = [];

for (const file of files) {
  const relativePath = path.relative(vaultDir, file);
  const title = path.basename(file, ".md");
  const raw = await fs.readFile(file, "utf8");
  const { body, tags } = parseFrontmatter(raw);
  const section = getSection(relativePath);

  rawPages.push({
    id: slugify(`${section}-${title}`),
    title,
    path: relativePath.replaceAll(path.sep, "/"),
    section,
    sectionLabel: sectionLabels.get(section) || "General Information",
    kind: getKind(section),
    tags,
    body: body.trim(),
    empty: body.trim().length === 0,
  });
}

const pageByTitle = new Map();
for (const page of rawPages) {
  page.slug = page.kind === "team"
    ? `teams/${slugify(page.title)}`
    : page.kind === "skill"
      ? `skills/${slugify(page.title)}`
      : page.kind === "trait"
        ? `traits/${slugify(page.title)}`
        : page.kind === "rules"
          ? `rules/${slugify(page.title)}`
          : page.kind === "cheatsheet"
            ? `cheatsheets/${slugify(page.title)}`
            : page.kind === "inducement"
              ? `inducements/${slugify(page.title)}`
              : slugify(page.title);
  pageByTitle.set(page.title, page);
}

const pages = rawPages.map((page) => {
  const tables = parseMarkdownTables(page.body);
  const teamTable = page.kind === "team" ? tables[0] : undefined;
  const roster = teamTable?.rows.map((row) => ({
    qty: stripFormatting(row.Qty || row["РЎРѕСЃС‚Р°РІ"] || ""),
    position: stripFormatting(row.Position || row["РџРѕР·РёС†РёСЏ"] || ""),
    ma: stripFormatting(row.MA || ""),
    st: stripFormatting(row.ST || ""),
    ag: stripFormatting(row.AG || ""),
    pa: stripFormatting(row.PA || ""),
    ar: stripFormatting(row.AR || ""),
    skills: splitListCell(row.Skills || row["РќР°РІС‹РєРё"] || ""),
    primary: splitListCell(row.Primary || row["РћСЃРЅРѕРІРЅС‹Рµ"] || ""),
    secondary: splitListCell(row.Secondary || row["Р’С‚РѕСЂРёС‡РЅС‹Рµ"] || ""),
    price: normalizeCost(row.Cost || row["Р¦РµРЅР°"] || ""),
    tags: splitListCell(row.Tags || row["РўРµРіРё"] || ""),
  })) || [];

  return {
    ...page,
    html: page.empty ? "" : markdownToHtml(page.body, pageByTitle),
    text: stripFormatting(page.body),
    team: page.kind === "team" ? {
      experimental: page.section === "Experimental" || page.section === "Р­РєСЃРїРµСЂРёРјРµРЅС‚Р°Р»СЊРЅС‹Рµ",
      meta: extractTeamMeta(page.body),
      roster,
    } : undefined,
    starPlayer: page.kind === "starPlayer" ? extractStarPlayerMeta(page.body) : undefined,
  };
});

const teams = pages.filter((page) => page.kind === "team").sort((a, b) => a.title.localeCompare(b.title, "en"));
const skills = pages.filter((page) => page.kind === "skill").sort((a, b) => a.title.localeCompare(b.title, "en"));
const traits = pages.filter((page) => page.kind === "trait").sort((a, b) => a.title.localeCompare(b.title, "en"));
const rules = pages.filter((page) => page.kind === "rules").sort((a, b) => a.title.localeCompare(b.title, "ru"));
const cheatsheets = pages.filter((page) => page.kind === "cheatsheet").sort((a, b) => a.title.localeCompare(b.title, "ru"));
const inducements = pages.filter((page) => page.kind === "inducement").sort((a, b) => a.title.localeCompare(b.title, "ru"));
const starPlayers = pages
  .filter((page) => page.kind === "starPlayer")
  .filter((page) => /\d/.test(page.starPlayer?.cost ?? "") && !(page.starPlayer?.cost ?? "").includes("|"))
  .sort((a, b) => a.title.localeCompare(b.title, "en"));
const otherPages = pages.filter((page) => page.kind === "page").sort((a, b) => a.title.localeCompare(b.title, "ru"));

const data = {
  generatedAt: new Date().toISOString(),
  counts: {
    pages: pages.length,
    teams: teams.length,
    skills: skills.length,
    traits: traits.length,
    rules: rules.length,
    cheatsheets: cheatsheets.length,
    inducements: inducements.length,
    starPlayers: starPlayers.length,
  },
  unresolvedLinks: [...new Set(
    pages.flatMap((page) => [...page.body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
      .map((match) => match[1].trim())
      .filter((target) => !resolveLinkedPage(pageByTitle, target) && !virtualLinks.has(target)))
  )],
  skillGroups: parseSkillGroups(pages),
  pages,
  teams,
  skills,
  traits,
  rules,
  cheatsheets,
  inducements,
  starPlayers,
  otherPages,
};

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(dataPath, JSON.stringify(data, null, 2), "utf8");

console.log(`Built ${data.counts.pages} pages into ${path.relative(rootDir, dataPath)}`);
if (data.unresolvedLinks.length) {
  console.log(`Unresolved links: ${data.unresolvedLinks.join(", ")}`);
}


