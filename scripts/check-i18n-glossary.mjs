import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");

function loadJson(filePath) {
  return fs.readFile(filePath, "utf8").then((raw) => JSON.parse(raw));
}

function collectIdentifiers(data) {
  const byId = new Map();
  for (const page of data.pages) {
    byId.set(page.id, { title: page.title, section: page.section, path: page.path });
  }
  return byId;
}

const [enData, ruData] = await Promise.all([
  loadJson(path.join(publicDir, "data.en.json")),
  loadJson(path.join(publicDir, "data.ru.json")),
]);

const enPages = collectIdentifiers(enData);
const ruPages = collectIdentifiers(ruData);

const mismatches = [];

for (const [id, enPage] of enPages) {
  const ruPage = ruPages.get(id);
  if (!ruPage) {
    mismatches.push(`Missing in RU data: ${enPage.path} (id: ${id})`);
    continue;
  }
  if (ruPage.title !== enPage.title) {
    mismatches.push(`Title mismatch for ${enPage.path}: EN "${enPage.title}" vs RU "${ruPage.title}"`);
  }
  if (ruPage.path !== enPage.path) {
    mismatches.push(`Path mismatch for id ${id}: EN "${enPage.path}" vs RU "${ruPage.path}"`);
  }
}

for (const id of ruPages.keys()) {
  if (!enPages.has(id)) {
    mismatches.push(`Extra page in RU data with no EN counterpart: ${ruPages.get(id).path} (id: ${id})`);
  }
}

if (mismatches.length > 0) {
  console.error(`i18n glossary check failed with ${mismatches.length} issue(s):`);
  for (const issue of mismatches) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

console.log(`i18n glossary check passed: ${enPages.size} pages have matching identifiers in both locales.`);
