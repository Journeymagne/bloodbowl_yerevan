# Smoke test

Run after every refactor task, before committing. Automated parts first, then
the manual pass — the manual pass is the only thing that covers rendering.

## 1. Automated

```bash
npm run check     # dead code + structure budgets
npm test          # domain and server unit tests
npm run build     # data + site build
npm run i18n:check
```

Then, with Postgres up (`npm run postgres:up`) and the site running
(`npm start`) in another terminal:

```bash
npm run smoke     # API + static exposure
```

`npm run smoke` registers a throwaway account named `smoke-<timestamp>`. It
deletes the team it creates but cannot delete its own user (there is no
self-service account deletion), so these accounts accumulate in the local
database. Clear them out occasionally:

```sql
DELETE FROM users WHERE login LIKE 'smoke-%';
```

Never point `APP_URL` at production.

Two optional browser checks (need `npm i -D playwright && npx playwright install chromium`):

```bash
npm run dev &                        # public screens, builder, static exposure
node scripts/browser-check.mjs

node scripts/mock-api.mjs &          # saved roster editor, no database needed
node scripts/browser-check-roster.mjs
```

The second one covers what the manual pass below checks by hand: the editor
renders, edits autosave, hiring works, SPP updates on both layouts, a reload
keeps the edits, and the roster sent to the server carries no retired keys.

Before deploying anything that touches roster storage, also run the shape check
against the real database (read-only):

```bash
DATABASE_URL=postgres://... node scripts/check-roster-shapes.mjs
```

## 2. Manual pass

Open http://localhost:3002.

### Reference (works logged out)

- [ ] Overview opens and shows the overview cards.
- [ ] Teams shows 37 cards; open one, the roster table is readable on a narrow
      window.
- [ ] Star Players, Skills, Traits, Inducements, References open.
- [ ] Global search filters the current section.
- [ ] Theme switcher: pick each of the six themes, the choice survives a reload.
- [ ] Language switch EN ⇄ RU: content and interface both change, the current
      route and scroll position are kept.

### Builder

- [ ] Pick a race, add seven players, the total cost updates.
- [ ] Buy a re-roll and an assistant coach, the cost updates.
- [ ] Exceed the budget: the blocked control explains why (after task 7) or at
      least stays disabled.
- [ ] Save the team — you land on the saved roster screen.

### Saved roster

- [ ] Rename the team, change a player's name, add a skill, add SPP.
- [ ] **Reload the page: every change above is still there.**
- [ ] Reorder players by drag and drop, reload, order is kept.
- [ ] Delete a player, the treasury changes as expected.
- [ ] Copy roster puts readable text on the clipboard.

### Data-loss scenarios (task 5)

- [ ] Edit a field that does not re-render (player name, number, SPP), wait for
      "saved", edit again without touching anything else, reload — both edits
      survived.
- [ ] Open the same roster in two tabs, save in both — the second one warns
      about a conflict instead of silently overwriting.
- [ ] Go offline in devtools, edit, come back online — the edit reaches the
      server.
- [ ] Build a roster in the builder, reload the page — the draft is offered
      back.
- [ ] Try to close the tab with unsaved changes — the browser warns.

### Season and games

- [ ] Season tabs open: registration, fixture, standings, schedule.
- [ ] Commit a team to the season.
- [ ] As admin: generate a round, start it, see the pairing.
- [ ] Submit a result as one player, confirm as the other. **The player who
      submitted the result must not be able to confirm it** (task 14).

### Admin

- [ ] Administration lists users; open a user, open their team, edit and save.
- [ ] The admin edit screen saves to the admin endpoint, not the owner one.

### Accessibility spot check

- [ ] Tab through the current screen: focus is always visible.
- [ ] Set the browser font size to 150 %: nothing is cut off.

## 3. After deploying

```bash
curl -f https://bloodbowlyerevan.shitpostsoftware.com/api/health

for p in /.env /.git/config /package.json /server/db/migrations/001_baseline.sql; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://bloodbowlyerevan.shitpostsoftware.com$p"
done
# expected: 404 everywhere
```

Then log in with a real account, open a saved roster, make one edit, reload,
and confirm it persisted.
