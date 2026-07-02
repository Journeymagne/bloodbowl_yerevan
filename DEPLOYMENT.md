# Deployment Handoff

This document is for the person who will publish the Gata Blood Bowl League reference site.

## Quick Deploy Checklist

1. Clone the repository.
2. Use the `gata-league` branch, or merge it into the branch you want to deploy.
3. Run `npm install`.
4. Run `npm run build`.
5. Confirm that `dist/` was generated.
6. Publish `dist/` on a static host, or connect the repository to Netlify.

## Netlify Settings

The repository already contains `netlify.toml`.

Expected settings:

```text
Build command: npm run build
Publish directory: dist
```

The app uses hash routes (`#/teams`, `#/builder`, etc.), but `netlify.toml` also includes a fallback redirect to `index.html` for static hosting safety.

## Manual Netlify Deploy

If you do not want to connect GitHub yet:

1. Run `npm run build` locally.
2. Open Netlify Drop.
3. Drag the generated `dist/` folder into Netlify.

This is good for a preview, but Git-based deploys are better for ongoing updates.

## Git-Based Netlify Deploy

Recommended flow:

1. Create a new GitHub repository for `Gata Blood Bowl League`.
2. Push this branch/repository to GitHub.
3. In Netlify, choose `Add new site` -> `Import an existing project`.
4. Select the GitHub repository.
5. Keep the build command and publish directory from `netlify.toml`.
6. Deploy.

After that, every push to the deployed branch will trigger a new build.

## Updating Content

For small text/content edits:

1. Edit Markdown files in `content/Gata`.
2. Run `npm run build`.
3. Commit and push.

For a full re-import from the original Gata source files:

1. Put the latest source files into `source/`.
2. Run `npm run import:gata`.
3. Run `npm run build`.
4. Review changed Markdown under `content/Gata`.
5. Commit and push.

Default source file names:

```text
source/Gata League 2_ Info.xlsx
source/Gata League 2.0 ENG.docx
source/Gata League 2 Changelog ENG.docx
```

The importer also accepts environment variables:

```text
GATA_XLSX
GATA_RULES_DOCX
GATA_CHANGELOG_DOCX
```

## Smoke Test Before Publishing

Run:

```bash
npm run build
npm run dev
```

Open:

```text
http://localhost:5173
```

Check at least:

- Overview opens.
- Teams shows 37 cards.
- Star Players shows 75 cards.
- Skills shows 93 cards.
- Traits shows 53 cards.
- Team Builder can add a player and update cost.
- A team detail page, for example `#/teams/amazon`, shows a horizontally scrollable roster table on mobile.

## Current UX And Content Questions

These are not blockers for deployment, but they should be decided before presenting the site as final.

- Should the builder default budget always be `600k`, or should it be configurable per league/event?
- Should exported rosters stay as plain `.txt`, or should we add a spreadsheet/BB roster format later?
- Should base skill/trait pages only link to Blood Bowl Base, or should league-specific changed skills be visually separated more strongly?
- Should the Gata site get its own logo/art, or keep the current reused visual style until later?

## Legal Note

The site is an unofficial fan reference and should not present itself as affiliated with Games Workshop. Base Blood Bowl wording should be linked or summarized instead of copied wholesale.
