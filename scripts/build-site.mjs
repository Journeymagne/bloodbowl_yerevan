import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function copyVaultAssets(from, to) {
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".obsidian") {
      continue;
    }

    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyVaultAssets(source, target);
    } else if (entry.isFile() && !entry.name.endsWith(".md")) {
      await fs.mkdir(to, { recursive: true });
      try {
        await fs.copyFile(source, target);
      } catch (error) {
        if (error.code !== "EPERM") {
          throw error;
        }
        await fs.access(target);
      }
    }
  }
}

await fs.mkdir(distDir, { recursive: true });
const indexHtml = await fs.readFile(path.join(rootDir, "index.html"), "utf8");
await fs.writeFile(path.join(distDir, "index.html"), indexHtml);
await copyDir(path.join(rootDir, "src"), path.join(distDir, "src"));
await copyDir(path.join(rootDir, "public"), path.join(distDir, "public"));
await copyDir(path.join(rootDir, "assets"), path.join(distDir, "assets"));
await copyVaultAssets(path.join(rootDir, "content", "7ZBBL"), path.join(distDir, "public", "vault-assets"));

const enDataJson = (await fs.readFile(path.join(rootDir, "public", "data.en.json"), "utf8"))
  .replace(/</g, "\\u003c");
const ruDataJson = (await fs.readFile(path.join(rootDir, "public", "data.ru.json"), "utf8"))
  .replace(/</g, "\\u003c");
const localPreviewHtml = indexHtml.replace(
  '<script type="module" src="src/app.js?v=gata-52"></script>',
  `<script>window.__REFERENCE_DATA__ = { en: ${enDataJson}, ru: ${ruDataJson} };</script>\n    <script src="src/app.js?v=gata-52"></script>`,
);
await fs.writeFile(path.join(distDir, "local-preview.html"), localPreviewHtml);

console.log("Built static site into dist");
