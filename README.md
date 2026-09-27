# Scrimside

A fast, local-first scrim roster helper. Plain HTML, CSS, and JavaScript: no runtime dependencies, accounts, backend, or build step. The complete original request is preserved in [ORIGINAL_REQUEST.md](ORIGINAL_REQUEST.md).

## Run locally

From this folder:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://localhost:4173>. Use an HTTP server rather than opening `index.html` directly, because the app uses JavaScript modules. Keep using the same hostname and port to access your saved data.

## A scrim in a few clicks

### Maps and bans

Below the roster, **Games** shows an editable next-game row and each logged game (newest first). Enter a mode, map name, and one hero ban per team. Everything autosaves; **Log game +1** records these details with the five players and starts a blank next-game row. The map field stays in sync with the top-bar map/note. Logged rows can be corrected without changing player counts.

The mode tracker crosses off modes from logged games and starts a fresh rotation after all five modes have been played. Repeated modes count only once per rotation; games without a mode are ignored. Editing a logged mode or undoing a game recalculates the rotation. Map and hero names are free text for now—no enforced map pools or ban rules. Existing backups work, and new exports include these details.

The overview bar keeps the contact BattleTag (edit and one-click copy), next map/note, attendance, and games played on the main screen. Edits save automatically. Click the games-played count to open the log.

Use **Flip coin** for an instant heads/tails result (click again to reflip). The theme toggle switches between light and dark; it initially follows your system theme and remembers your choice on this browser. Lineup players have a neutral gray highlight and silver border, with their current role in a colored icon beside attendance. Off-role fills have a pink icon and assignment control.

Dark mode uses neutral **Charcoal**. Switch themes using the sun/moon button beside the settings gear at the top right. Support uses healing green, DPS reddish orange, and tank blue in both themes.

1. Open **+ Players** to create players or check existing ones into this scrim. Choose their roles and **Default**, **Trial**, or **Team member** status.
2. Each player has one row, with present players first and then fewest games. Click anywhere on their strip to put them in: a single usual role is chosen immediately; for flex players, a single open eligible slot is chosen automatically. If several are open, they highlight with dashed borders while other slots and players dim; if none are open, all their usual roles highlight. Pick beside the player's name or in the lineup strip. Nothing shifts during selection. Attendance, assignment dropdowns, copy, and edit controls keep their separate actions. Clicking an already-assigned player leaves them in place. Escape or clicking their strip again cancels a choice.
3. Toggle the circle beside a name to mark attendance. Planning works before players arrive; logging needs five different, present players.
4. Click **Log game +1** after a game. The selected five each gain a game; their lineup stays selected. Each row shows a total-games bar plus smaller bars for every group they play: tank, DPS (HSDPS + FDPS), and support (MS + FS). Current off-role assignments and groups with past games also appear. All bars share a scale of `max(5, games logged this scrim)`, with one segment per game. Numbers show exact counts, using the roles recorded in past games. **Undo game** updates all bars immediately. Sorting puts present players first, then fewest total games, then trials before everyone else, then alphabetical order. Absent players always stay at the bottom.

The roster always shows everyone, with one row per player. Use the role-heading hover previews to find eligible players without hiding anyone.

Drag a player onto an occupied slot or another player's row to swap their positions. Bench-to-lineup swaps work in either direction; two benched players stay benched. Off-role swaps are allowed and turn pink. Drop on an empty slot to move there, or outside the lineup and player rows to bench someone. **Undo** restores both sides of a swap.

Hover the Tank, DPS, or Support heading above the lineup to highlight players with any role in that group, even when the slots are filled. Hover an empty lineup slot to highlight players who play that exact role instead. Other players dim; moving away restores the roster. This is a preview only: it does not change assignments or counts. Keyboard focus offers the same previews.

The **Playing as** dropdown remains available for explicit assignments, including off-roles; **Bench** sits a player out. Assigning an occupied slot automatically benches its previous player. Swaps and game undo show a temporary **Undo** action. The copy icon beside **⋯** copies a player's BattleTag in one click; it is disabled when no BattleTag is set. Click **⋯** to edit their details. Trial/team badges are informational and do not change counts or ordering.

The **Playing as** dropdown includes off-role fills, marked with a pink badge and dropdown that explicitly says **off-role**. Dropdown assignments replace the destination and clear the player's previous slot; dragging onto an occupied slot swaps both players instead. Changes can be undone. The player's usual roles remain unchanged, and logged games count toward the role actually filled. Off-role lineups work with saved plans and backups too.

To bench someone, right-click their player row or occupied lineup slot, or drag them outside the lineup strip and player rows. A **Drop to bench** hint confirms a bench drop before you release. Dropping onto another player swaps positions instead. Canceling a drag or dropping outside the browser does not bench them. **Undo** restores the assignment; attendance and game counts stay unchanged.

Popups close when you click outside or press Escape. Player details save as you edit, including partially entered new players. Players without roles remain available under **Choose roles**. Clicking outside a confirmation cancels that action.

**Plans & history** contains saved lineups and the game log. Add an optional map/name and choose **Save lineup**; **Use this lineup** restores it and returns to the board. The gear or scrim name opens settings for the opponent BattleTag, new scrim, and import/export. The compact board is always the default view.

Editing a player's opted-in roles keeps their current and planned assignments; any nonmatching current assignment appears as an off-role fill. Removing a player does not erase played-game history. Starting a new scrim retains the directory and clears this scrim's attendance, plans, and history; export first to retain a record.

## Saving and sharing

Changes automatically save to `localStorage` under `scrimside.v1`. **Export** downloads a JSON backup of the directory and current scrim. **Import** validates a backup and asks before replacing your current data. Backups are snapshots, not merges or live collaboration.

Data stays in your browser and is not sent to GitHub. Different devices, browsers, website origins, and private browsing sessions have separate storage. Clearing site data removes local saves. Export regularly, especially before starting a new scrim. Another tab changing saved data pauses writes in this tab; reload to use the latest saved state or export this tab first.

## GitHub Pages

Repository: <https://github.com/ijchen/scrims-helper>

Website: <https://ijchen.github.io/scrims-helper/>

In repository **Settings → Pages**, set the source to **GitHub Actions**. Pushing to `master` runs the model tests and deploys the website through `.github/workflows/pages.yml`. You can also run that workflow manually from the Actions tab.

Only the HTML, CSS, JavaScript, and `.nojekyll` are included in the deployed artifact. All asset paths are relative, so repository-subpath hosting works without configuration. Never commit roster backups or secrets.

To move your existing local roster to the hosted website, **Export** from your local app, open the website, then **Import** that file. The two origins have separate browser storage; updates to the website do not erase its saved roster.

## Development checks

Node.js 22+ runs the data-model tests with no installation step:

```sh
node --test tests/*.test.js
```

On NixOS, use your existing Node environment or `nix shell nixpkgs#nodejs` first. The app itself only needs a browser and static file hosting; no changes to `~/nixos` are required.

## Next iterations

- Map board for Control, Push, Hybrid, Escort, and Flashpoint, with mode locking and five-mode rotation resets.
- Map/hero pickers, configurable map pools, and ban role-conflict feedback.
- Hero pool images or specialist details if they prove useful later.

These are intentionally deferred while the roster workflow gets real scrim use.
