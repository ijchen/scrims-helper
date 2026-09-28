# Scrims Helper

A fast, local-first scrim roster helper. Plain HTML, CSS, and JavaScript: no runtime dependencies, accounts, backend, or build step. The complete original request is preserved in [ORIGINAL_REQUEST.md](ORIGINAL_REQUEST.md).

## Run locally

From this folder:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://localhost:4173>. Use an HTTP server rather than opening `index.html` directly, because the app uses JavaScript modules. Keep using the same hostname and port to access your saved data.

## A scrim in a few clicks

### Maps and bans

Below the roster, **Games** separates **Upcoming** (dashed border), **In progress** (amber border), and **Completed** cards. Every card shows the map image, both banned heroes, and all five players. Click a map or ban to change it; **Edit** also lets you correct who played each role. Historical lineup corrections update total and role-specific playtime automatically without changing the current lineup.

The roster and games scroll independently on landscape displays. All completed games appear newest-first below the active/upcoming game. The horizontal overview stays chronological (Game 1 onward); click a thumbnail to scroll to that game. **Prepare next game** reveals the upcoming planning card during a live game. **Win / Loss / Draw** finish the active game and count playtime. Results remain editable afterward; click the selected result again to clear it. The W/L/D summary counts completed games only. Portrait/narrow displays keep a stacked page layout.

On landscape displays at least 1100px wide, roster and games sit side by side within the viewport. Header, lineup slots, and game controls stay visible; long rosters or expanded game details scroll inside their own panels. Portrait and smaller windows retain the stacked layout.

**Start game** captures the chosen five and the map/bans without adding playtime. **Finish game +1** credits that captured lineup, even if you have already started arranging the next five. You can prepare the next map and bans while a game is in progress. **Back to upcoming** undoes a start; it asks you to clear any separately prepared upcoming map/bans first rather than overwriting them. The most recent completed game's editor has **Mark in progress** to reverse an early finish. All stages and edits autosave and survive reloads.

Map/hero pickers show images and support case/accent-insensitive search, common abbreviations (`kr`, `gib`, `brig`, `76`), partial names, and small typos. Arrow keys and Enter work too. Known maps set their mode automatically. Custom names remain possible; set a custom map's mode through **Details/Edit**. The local catalog and bundled images are documented in [ASSETS.md](ASSETS.md); map pools and ban-role rules are not enforced yet.

The mode tracker uses completed games only and starts a fresh rotation after all five modes have been played. Repeated modes count once per rotation. Map corrections, reopening, and undo recalculate it. Existing backups remain compatible: old logged games become completed cards, not drafts.

The overview bar keeps the contact BattleTag (edit and one-click copy), next map/note, attendance, and games played on the main screen. Edits save automatically. Click the games-played count to open the log.

Use **Flip coin** for an instant heads/tails result (click again to reflip). The theme toggle switches between light and dark; it initially follows your system theme and remembers your choice on this browser. Lineup players have a neutral gray highlight and silver border, with their current role in a colored icon beside attendance. Off-role fills have a pink icon and assignment control.

Dark mode uses neutral **Charcoal**. Switch themes using the sun/moon button beside the settings gear at the top right. Support uses healing green, DPS reddish orange, and tank blue in both themes.

1. Open **+ Players** to create players or check existing ones into this scrim. Choose their roles and **Default**, **Trial**, or **Team member** status.
2. Each player has one row, with present players first and then fewest games. Click anywhere on their strip to put them in: a single usual role is chosen immediately; for flex players, a single open eligible slot is chosen automatically. If several are open, they highlight with dashed borders while other slots and players dim; if none are open, all their usual roles highlight. Pick beside the player's name or in the lineup strip. Nothing shifts during selection. Attendance, assignment dropdowns, copy, and edit controls keep their separate actions. Clicking an already-assigned player leaves them in place. Escape or clicking their strip again cancels a choice.
3. Toggle the circle beside a name to mark attendance. Absent players have dimmed rows and a **Not here** badge. Planning never changes attendance automatically. With five slots filled, **Start game** remains available even if attendance is missing: it lists those players and offers **Mark them here & start**. Cancel, Escape, or clicking outside leaves everything unchanged; unselected players are never marked present by this action.
4. Click **Start game** when the five enter the match, then **Finish game +1** afterward. Only completed games count. Each row shows total games plus smaller bars for tank, DPS (HSDPS + FDPS), and support (MS + FS). All bars share a scale of `max(5, games completed this scrim)`. **Undo game** updates the counts immediately. Sorting puts present players first, then fewest total games, then trials, then alphabetical order.

The roster always shows everyone, with one row per player. Use the role-heading hover previews to find eligible players without hiding anyone.

**Autofill** fills only empty slots and keeps all existing selections, including off-role or absent players you selected manually. New selections must be present, distinct, and opted into the assigned role. It either produces a complete lineup or changes nothing and explains which roles lack enough eligible players. Undo restores the previous lineup.

Autofill ranks complete options by these criteria, in order:
1. Largest playtime fairness gain: each added player contributes `1 / (games played + 1)`.
2. Largest reduction in total squared imbalance across each player's opted-in Tank / DPS / Support groups.
3. Largest reduction in squared imbalance between opted-in subroles within DPS or Support.
4. Most trials added (ahead of both default and team members).
5. Uniform random choice among equally ranked complete assignments. Undo and retry may give another equally good lineup, but can also repeat it.

Completed and in-progress snapshots both count toward these calculations. Role balance measures improvement, not existing imbalance; fixed selections contribute the same amounts to every candidate and need not be scored. Harmonic gains are compared with exact integer arithmetic, and role-balance gains are scaled to integers, so numerical rounding does not break ties. A dynamic program over at most 32 slot subsets finds globally optimal assignments without enumerating every lineup; it tracks the number of tied assignments to sample fairly.

**Swaps**, beside **Clear lineup**, compares your selected five with the in-progress game, or the most recent completed game if none is active. Players staying in are omitted even if they change roles. Incoming and outgoing players are paired to minimize cross-role-group substitutions, then prefer exact roles. The popup shows each pair and a copyable message using BattleTags without the numeric suffix (falling back to display names). Fill all five slots first; this only prepares a message and does not change attendance or either lineup.

Drag a player onto an occupied slot or another player's row to swap their positions. Bench-to-lineup swaps work in either direction; two benched players stay benched. Off-role swaps are allowed and turn pink. Drop on an empty slot to move there, or outside the lineup and player rows to bench someone. **Undo** restores both sides of a swap.

Hover the Tank, DPS, or Support heading above the lineup to highlight players with any role in that group, even when the slots are filled. Hover an empty lineup slot to highlight players who play that exact role instead. Other players dim; moving away restores the roster. This is a preview only: it does not change assignments or counts. Keyboard focus offers the same previews.

The **Playing as** dropdown remains available for explicit assignments, including off-roles; **Bench** sits a player out. Assigning an occupied slot automatically benches its previous player. Swaps and game undo show a temporary **Undo** action. The copy icon beside **⋯** copies a player's BattleTag in one click; it is disabled when no BattleTag is set. Click **⋯** to edit their details. Trial/team badges are informational and do not change counts or ordering.

The **Playing as** dropdown includes off-role fills, marked with a pink badge and dropdown that explicitly says **off-role**. Dropdown assignments replace the destination and clear the player's previous slot; dragging onto an occupied slot swaps both players instead. Changes can be undone. The player's usual roles remain unchanged, and logged games count toward the role actually filled. Off-role lineups survive backups too.

To bench someone, right-click their player row or occupied lineup slot, or drag them outside the lineup strip and player rows. A **Drop to bench** hint confirms a bench drop before you release. Dropping onto another player swaps positions instead. Canceling a drag or dropping outside the browser does not bench them. **Undo** restores the assignment; attendance and game counts stay unchanged.

Popups close when you click outside or press Escape. Player details save as you edit, including partially entered new players. Players without roles remain available under **Choose roles**. Clicking outside a confirmation cancels that action.

Games and their recorded lineups are visible directly in the Games panel. Edit the scrim name and opponent BattleTag in the summary bar. The gear opens settings for a new scrim and import/export. The old Plans & history dialog and saved-plan field are removed. Original legacy saves remain available as recovery copies.

Editing a player's opted-in roles keeps their current assignment; any nonmatching current assignment appears as an off-role fill. Removing a player does not erase played-game history. Starting a new scrim retains the directory and clears this scrim's attendance, lineup, and history; export first to retain a record.

## Saving and sharing

Old Scrimside saves and preferences migrate automatically without overwriting the originals. The temporary legacy-key lookup is scheduled for code review/removal on October 12, 2026; it does not expire automatically. See [MIGRATIONS.md](MIGRATIONS.md) for recovery details and the cleanup checklist.

Changes automatically save to `localStorage` under `scrims-helper.state` (format version 2). **Export** downloads a JSON backup of the directory and current scrim. **Import** validates a backup and asks before replacing your current data. Backups are snapshots, not merges or live collaboration.

Data stays in your browser and is not sent to GitHub. Different devices, browsers, website origins, and private browsing sessions have separate storage. Clearing site data removes local saves. Export regularly, especially before starting a new scrim. Another tab changing saved data pauses writes in this tab; reload to use the latest saved state or export this tab first.

## GitHub Pages

Repository: <https://github.com/ijchen/scrims-helper>

Website: <https://ijchen.github.io/scrims-helper/>

In repository **Settings → Pages**, set the source to **GitHub Actions**. Pushing to `master` runs the model tests and deploys the website through `.github/workflows/pages.yml`. You can also run that workflow manually from the Actions tab.

Only website HTML, CSS, JavaScript, bundled map/hero images, and `.nojekyll` are included in the deployed artifact. All asset paths are relative, so repository-subpath hosting works without configuration. Never commit roster backups or secrets.

To move your existing local roster to the hosted website, **Export** from your local app, open the website, then **Import** that file. The two origins have separate browser storage; updates to the website do not erase its saved roster.

## Development checks

Node.js 22+ runs the data-model tests with no installation step:

```sh
node --test tests/*.test.js
```

On NixOS, use your existing Node environment or `nix shell nixpkgs#nodejs` first. The app itself only needs a browser and static file hosting; no changes to `~/nixos` are required.

## Next iterations

- Configurable map pools and ban role-conflict feedback.
- Hero pool images or specialist details if they prove useful later.

These are intentionally deferred while the roster workflow gets real scrim use.
