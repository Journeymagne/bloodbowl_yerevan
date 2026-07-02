import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultDir = path.join(rootDir, "content", "7ZBBL");
const teamsDir = path.join(vaultDir, "Команды");
const skillsDir = path.join(vaultDir, "Навыки и свойства", "Навыки");
const traitsDir = path.join(vaultDir, "Навыки и свойства", "Свойства");

function slugSort(a, b) {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function titlesFrom(dir) {
  const files = await walk(dir);
  return files.map((file) => path.basename(file, ".md"));
}

function linkFor(label, target) {
  return label.toLowerCase() === target.toLowerCase()
    ? `[[${target}]]`
    : `[[${target}|${label}]]`;
}

function linkKnownTerms(markdown, terms) {
  let next = markdown;

  for (const term of terms) {
    const pattern = new RegExp(`(^|[^A-Za-zА-Яа-я0-9])(${escapeRegExp(term.label)})(?=$|[^A-Za-zА-Яа-я0-9])`, "gi");
    next = next
      .split(/(\[\[[\s\S]*?\]\])/g)
      .map((part) => {
        if (part.startsWith("[[")) {
          return part;
        }
        return part.replace(pattern, (_match, prefix, label) => `${prefix}${linkFor(label, term.target)}`);
      })
      .join("");
  }

  return next;
}

async function ensureTeamIndex(teamFiles) {
  const regular = [];
  const experimental = [];

  for (const file of teamFiles) {
    const title = path.basename(file, ".md");
    if (file.includes(`${path.sep}Экспериментальные${path.sep}`)) {
      experimental.push(title);
    } else {
      regular.push(title);
    }
  }

  const body = [
    "# Список команд",
    "",
    "## Основные команды",
    "",
    ...regular.sort(slugSort).map((title) => `- [[${title}]]`),
    "",
    "## Экспериментальные команды",
    "",
    ...experimental.sort(slugSort).map((title) => `- [[${title}]]`),
    "",
  ].join("\n");

  await fs.writeFile(path.join(vaultDir, "Список команд.md"), body, "utf8");
}

const skills = await titlesFrom(skillsDir);
const traits = await titlesFrom(traitsDir);
const exactTerms = [...skills, ...traits].map((title) => ({ label: title, target: title }));
const aliasTerms = [
  { label: "Bone Head", target: "Bonehead" },
  { label: "Unchannelled Fury", target: "Unchanneled Fury" },
  { label: "Loner (2+)", target: "Loner (X+)" },
  { label: "Loner (3+)", target: "Loner (X+)" },
  { label: "Loner (4+)", target: "Loner (X+)" },
  { label: "Loner (5+)", target: "Loner (X+)" },
  { label: "Animosity (All)", target: "Animosity (X)" },
  { label: "Animosity (Underworld Goblin Linemen)", target: "Animosity (X)" },
  { label: "Hatred (Troll)", target: "Hatred (X)" },
];

const terms = [...aliasTerms, ...exactTerms]
  .sort((a, b) => b.label.length - a.label.length);

const teamFiles = await walk(teamsDir);
let changed = 0;

for (const file of teamFiles) {
  const before = await fs.readFile(file, "utf8");
  const after = linkKnownTerms(before, terms);
  if (after !== before) {
    await fs.writeFile(file, after, "utf8");
    changed += 1;
  }
}

await ensureTeamIndex(teamFiles);

console.log(`Standardized ${changed} team files`);
console.log("Ensured content/7ZBBL/Список команд.md");
