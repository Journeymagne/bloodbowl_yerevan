# Gata Blood Bowl League — project context

Read [docs/project-context.md](docs/project-context.md) for the current project
snapshot, architecture, run modes, checks and known limitations. It distinguishes
committed league features from the tabletop work present in the working tree.

Contributor conventions are in [CLAUDE.md](CLAUDE.md). For content and translation
changes, also read [docs/i18n-glossary.md](docs/i18n-glossary.md).

- The league app uses vanilla JavaScript ES modules and a hash router. `src/app.js`
  is the bootstrap; screens, components, data and domain logic live separately.
- The Node HTTP server uses PostgreSQL through `pg`. Apply migrations explicitly
  with `npm run db:migrate`; startup checks that the schema is current.
- The league UI and content are EN/RU. The separate `/play` prototype currently
  uses English and its own UI/theme modules; see [docs/play-demo.md](docs/play-demo.md).
- Tabletop exhibitions read league teams but do not settle league matches or
  update saved rosters. Online rooms are held in memory.
- Replacing or withdrawing a team must preserve its match history and its
  opponents' results. Keep historical entries; never transfer a recorded result
  to a replacement team or delete matches that contain history.
- Edit source files; `dist/` and `public/data*.json` are generated. The hand-authored
  `public/play.html` is an exception and is part of the tabletop source.
- Use `package.json` for available commands. The standard checks are
  `npm run build`, `npm run check`, `npm run i18n:check` and `npm test`;
  database smoke checks require a running local league server.

Keep the context snapshot current when architecture or workflows change. Dated
plans preserve implementation history; verify their pending items against code
before treating them as current work.
