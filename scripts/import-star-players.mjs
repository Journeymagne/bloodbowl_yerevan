import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = path.join(rootDir, "content", "7ZBBL");
const starsDir = path.join(vaultDir, "Звездные игроки");
const starsIndexPath = path.join(starsDir, "_index.json");
const teamsDir = path.join(vaultDir, "Команды");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/import-star-players.mjs <stars.csv>");
  process.exit(1);
}

const skillAliases = new Map([
  ["Ball & Chain", "Ball and Chain"],
  ["Bone-Head", "Bonehead"],
  ["Bone-head", "Bonehead"],
  ["Break tackle", "Break Tackle"],
  ["Chaotic Impulse", "Unchanneled Fury"],
  ["Dirty player", "Dirty Player"],
  ["Diving catch", "Diving Catch"],
  ["Disturbing presence", "Disturbing Presence"],
  ["Dump-off", "Dump-Off"],
  ["Fire Breath", "Breathe Fire"],
  ["Foul Apearance", "Foul Appearance"],
  ["Jump up", "Jump Up"],
  ["Kick Team-mate", "Kick Team-Mate"],
  ["Mighty Blow (+1)", "Mighty Blow"],
  ["Mighty Blow (+2)", "Mighty Blow"],
  ["Mighty blow", "Mighty Blow"],
  ["Monstrous mouth", "Monstrous Mouth"],
  ["Nerves of steel", "Nerves of Steel"],
  ["No Hands", "No Ball"],
  ["No hands", "No Ball"],
  ["Piledriver", "Pile Driver"],
  ["Prehesile Tail", "Prehensile Tail"],
  ["Prehensile tail", "Prehensile Tail"],
  ["Regenearation", "Regeneration"],
  ["Right stuff", "Right Stuff"],
  ["Safe pass", "Safe Pass"],
  ["Side Step", "Sidestep"],
  ["Steady footing", "Steady Footing"],
  ["Sure feet", "Sure Feet"],
  ["Sure hands", "Sure Hands"],
  ["Thick skull", "Thick Skull"],
  ["Two heads", "Two Heads"],
  ["Throw Team-mate", "Throw Team-Mate"],
  ["Timm-ber!", "Timmm-ber!"],
  ["Unchannelled Fury", "Unchanneled Fury"],
  ["Very Stupid", "Really Stupid"],
]);

function parseCsvRecords(source) {
  const records = [];
  let record = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\"") {
      if (quoted && source[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      record.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      record.push(current);
      if (record.some((cell) => cell.trim())) {
        records.push(record);
      }
      record = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current || record.length) {
    record.push(current);
    if (record.some((cell) => cell.trim())) {
      records.push(record);
    }
  }

  return records;
}

function normalizeCsvRow(cells) {
  const padded = [...cells];
  while (padded.length < 10) {
    padded.push("");
  }

  if (padded.length > 10) {
    return [
      ...padded.slice(0, 8),
      padded.slice(8, -1).join(", ").trim(),
      padded.at(-1).trim(),
    ];
  }

  return padded.slice(0, 10).map((cell) => cell.trim());
}

function splitList(value = "") {
  return value
    .replace(/Secret Weapon\.\s*Loner/gi, "Secret Weapon, Loner")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function linkTerm(term) {
  const clean = term.trim();
  const loner = clean.match(/^Loner\s*\(([^)]+)\)$/i);
  if (loner) {
    return `[[Loner (X+)|Loner (${loner[1]})]]`;
  }

  const hatred = clean.match(/^Hatred\s*\(([^)]+)\)$/i);
  if (hatred) {
    return `[[Hatred (X)|Hatred (${hatred[1]})]]`;
  }

  const animosity = clean.match(/^Animosity\s*\(([^)]+)\)$/i);
  if (animosity) {
    return `[[Animosity (X)|Animosity (${animosity[1]})]]`;
  }

  const target = skillAliases.get(clean) || clean;
  return target === clean ? `[[${target}]]` : `[[${target}|${clean}]]`;
}

function safeFileName(value) {
  return value
    .replace(/"/g, "'")
    .replace(/[<>:/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeTag(value) {
  return value.replace(/#/g, "").trim();
}

function starSortName(name) {
  return name.replace(/\s*\(МЕГА-ЗВЕЗДА\)\s*/i, "").trim();
}

function normalizeRule(value = "") {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/favored/g, "favoured")
    .replace(/kingdoms/g, "kingdom")
    .replace(/worlds/g, "world")
    .replace(/world's/g, "world")
    .replace(/oId/gi, "old")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamMatchesGroup(team, group) {
  if (group === "Any Team" || group === "Hall of Fame") {
    return true;
  }

  const normalizedSpecial = normalizeRule(team.specialRules);
  const normalizedGroup = normalizeRule(group);
  return normalizedSpecial.includes(normalizedGroup);
}

async function walkMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractTeamSpecialRules(markdown) {
  return markdown.match(/\*\*Специальные правила:\*\*\s*([^\n]+)/i)?.[1]?.trim() || "";
}

function stripExistingStarBlock(markdown) {
  return markdown
    .replace(/\n+\*\*Звездные игроки:\*\*\n(?:- \[\[[^\n]+\]\]\n?)+/g, "")
    .replace(/\n+\*\*Звездные игроки:\*\*\s*[^\n]+/g, "")
    .trimEnd();
}

function starLink(name) {
  return `[[${safeFileName(name)}]]`;
}

function renderProfileTable(row) {
  return [
    "| MA | ST | AG | PA | AR | Цена | Навыки | Ключевые слова |",
    "| :-: | :-: | :-: | :-: | :-: | :--: | :----- | :------------- |",
    `| ${row.ma || "-"} | ${row.st || "-"} | ${row.ag || "-"} | ${row.pa || "-"} | ${row.ar || "-"} | ${row.cost || "-"} | ${row.skills.map(linkTerm).join(", ")} | ${row.keywords.join(", ") || "-"} |`,
  ].join("\n");
}

function renderStarFile(star, teams) {
  const availability = [...new Set(star.variants.map((variant) => variant.group))].sort((a, b) => a.localeCompare(b, "en"));
  const teamLinks = teams
    .filter((team) => availability.some((group) => teamMatchesGroup(team, group)))
    .map((team) => starLink(team.title))
    .sort((a, b) => a.localeCompare(b, "ru"));
  const primary = star.variants[0];
  const tags = [
    "Звездный игрок",
    ...availability,
    ...primary.keywords,
  ].map(escapeTag).filter(Boolean);

  const frontmatter = [
    "---",
    "tags:",
    ...[...new Set(tags)].map((tag) => `  - ${tag}`),
    "---",
  ].join("\n");

  const intro = [
    `**Имя:** ${star.name}`,
    `**Доступность:** ${availability.join(", ")}`,
    `**Цена:** ${primary.cost || "-"}`,
    `**Команды:** ${teamLinks.join(", ") || "Уточнить"}`,
  ].join("\n");

  const variants = star.variants.map((variant) => {
    const ability = variant.ability.trim() || "Уточнить.";
    return [
      `## ${variant.group}`,
      renderProfileTable(variant),
      "",
      `**Персональная способность:** ${ability}`,
    ].join("\n");
  }).join("\n\n");

  return `${frontmatter}\n${intro}\n\n${variants}\n`;
}

const csv = await fs.readFile(csvPath, "utf8");
const records = parseCsvRecords(csv);
const rows = [];
let currentGroup = "";

for (const rawRecord of records) {
  const nonEmpty = rawRecord.filter((cell) => cell.trim()).length;
  if (nonEmpty === 1 && rawRecord[0].trim() && rawRecord[0].trim() !== "Name") {
    currentGroup = rawRecord[0].trim();
    continue;
  }

  if (rawRecord[0]?.trim() === "Name") {
    continue;
  }

  if (!currentGroup || !rawRecord[0]?.trim()) {
    continue;
  }

  const [name, ma, st, ag, pa, ar, cost, skills, ability, keywords] = normalizeCsvRow(rawRecord);
  rows.push({
    group: currentGroup,
    name,
    ma,
    st,
    ag,
    pa,
    ar,
    cost,
    skills: splitList(skills),
    ability,
    keywords: splitList(keywords),
  });
}

const stars = new Map();
for (const row of rows) {
  if (!stars.has(row.name)) {
    stars.set(row.name, { name: row.name, variants: [] });
  }
  stars.get(row.name).variants.push(row);
}

const teamFiles = await walkMarkdown(teamsDir);
const teams = [];
for (const file of teamFiles) {
  const markdown = await fs.readFile(file, "utf8");
  teams.push({
    file,
    title: path.basename(file, ".md"),
    specialRules: extractTeamSpecialRules(markdown),
  });
}

const resolvedStarsDir = path.resolve(starsDir);
const resolvedVaultDir = path.resolve(vaultDir);
if (!resolvedStarsDir.startsWith(resolvedVaultDir)) {
  throw new Error(`Refusing to write outside the vault: ${resolvedStarsDir}`);
}

await fs.mkdir(starsDir, { recursive: true });

const usedFileNames = new Set();
for (const star of [...stars.values()].sort((a, b) => starSortName(a.name).localeCompare(starSortName(b.name), "ru"))) {
  let fileName = `${safeFileName(star.name)}.md`;
  let suffix = 2;
  while (usedFileNames.has(fileName.toLowerCase())) {
    fileName = `${safeFileName(star.name)} ${suffix}.md`;
    suffix += 1;
  }
  usedFileNames.add(fileName.toLowerCase());
  await fs.writeFile(path.join(starsDir, fileName), renderStarFile(star, teams), "utf8");
}

await fs.writeFile(starsIndexPath, JSON.stringify({
  generatedFrom: path.basename(csvPath),
  files: [...usedFileNames].sort(),
}, null, 2), "utf8");

for (const team of teams) {
  const markdown = await fs.readFile(team.file, "utf8");
  const availableStars = [...stars.values()]
    .filter((star) => star.variants.some((variant) => teamMatchesGroup(team, variant.group)))
    .map((star) => star.name)
    .sort((a, b) => starSortName(a).localeCompare(starSortName(b), "ru"));
  const starBlock = availableStars.length
    ? `\n\n**Звездные игроки:**\n${availableStars.map((name) => `- ${starLink(name)}`).join("\n")}`
    : "";
  await fs.writeFile(team.file, `${stripExistingStarBlock(markdown)}${starBlock}\n`, "utf8");
}

console.log(`Imported ${stars.size} star players from ${rows.length} CSV rows.`);
