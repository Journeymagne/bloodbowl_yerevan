# Gata Blood Bowl League Reference

Static reference site for the Gata Blood Bowl League, an unofficial Blood Bowl Sevens fan league.

The site contains:

- team rosters and team-building data;
- star player reference cards;
- skills and traits reference entries;
- Gata league rules and patch notes;
- a lightweight team builder;
- legal/disclaimer text for an unofficial fan project.

## Project Structure

- `content/Gata` - generated Markdown content used as the source for the site.
- `scripts/import-gata-content.py` - optional importer from the original Gata `.xlsx` and `.docx` source files.
- `scripts/build-data.mjs` - converts Markdown content into `public/data.json`.
- `scripts/build-site.mjs` - copies the static app into `dist` for hosting.
- `index.html`, `src/app.js`, `src/styles.css` - static frontend.
- `public/data.json` - generated site data.
- `dist` - generated deploy output, ignored by Git and recreated during build.
- `netlify.toml` - Netlify build and redirect settings.

## Commands

```bash
npm run build
npm run dev
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd run build
npm.cmd run dev
```

After `npm run dev`, the site runs at:

```text
http://localhost:5173
```

## Optional Content Re-import

The repository already contains generated Markdown in `content/Gata`, so a deployer does not need the original source files just to publish the site.

If the original source files change, put them into `source/` with these names:

```text
source/Gata League 2_ Info.xlsx
source/Gata League 2.0 ENG.docx
source/Gata League 2 Changelog ENG.docx
```

Then run:

```bash
npm run import:gata
npm run build
```

You can also point the importer at files elsewhere:

```powershell
$env:GATA_XLSX="C:\path\to\Gata League 2_ Info.xlsx"
$env:GATA_RULES_DOCX="C:\path\to\Gata League 2.0 ENG.docx"
$env:GATA_CHANGELOG_DOCX="C:\path\to\Gata League 2 Changelog ENG.docx"
npm.cmd run import:gata
npm.cmd run build
```

## Deployment

See `DEPLOYMENT.md` for Netlify and handoff instructions.

## Notes

This is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by Games Workshop. Base Blood Bowl wording is referenced externally instead of being reproduced wholesale.
