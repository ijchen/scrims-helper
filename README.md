# Scrims Helper

A fast, local-first Overwatch scrim manager for coaches: plan lineups, track
attendance and playtime, and record maps, bans, and results.

**[Open Scrims Helper](https://ijchen.github.io/scrims-helper/)**

Plain HTML, CSS, and JavaScript. No accounts, backend, runtime dependencies, or
build step. Data stays in your browser; exports let you back it up or share it.

## Running a scrim

1. Edit the scrim name and opponent BattleTag in the top bar.
2. Use **Add player** beneath the roster to select directory players or create
   new ones. Mark attendance with the circle beside each name.
3. Fill Tank, HSDPS, FDPS, MS, and FS by clicking players or dragging them into
   slots. **Autofill** fills the remaining slots with eligible present players.
4. Choose a map and each team's hero ban. **Start game** captures those settings
   and the five selected players. If anyone is not marked present, you can
   confirm their attendance before starting.
5. Finish with **Win / Loss / Draw** to credit the recorded lineup. During a
   game, arrange the next lineup and use **Prepare next game** to set its map/bans.

The top bar shows attendance, games played, W/L/D, and copy buttons for the
contact BattleTag and custom game code. **Flip coin** briefly shows a result.

### Lineup and playtime

- Click a player for their single main role or single open main-role slot.
  If there are several choices, select a highlighted slot. You can also click
  an empty slot first, then a player. Escape or clicking outside cancels selection.
- Hover or focus role headings and empty slots to preview eligible players.
  Main roles stand out; declared fills have outlined badges; unlisted players dim.
  Manual unlisted assignments remain possible and are marked pink.
- Drag onto another player to swap positions. Right-click a player or drag them
  outside the lineup and player rows to bench them. **Playing as** allows explicit
  assignments; **Clear lineup** benches everyone. Assignment changes offer **Undo**.
- Rows sort by attendance, fewest preferred-role games including the active game,
  then fewest completed preferred-role games, trial status, and name.
  Fills do not count toward sorting. Bars still show actual games.
- Segmented bars are game-by-game timelines, oldest on the left, with gaps for
  games sat out. Solid segments are preferred-role games; muted outlines are
  fills, and stripes indicate the in-progress game. Hover a segment for its
  game and role. Numbers still show completed counts. Their shared scale is
  `max(5, completed games + in-progress game)`.
- Settings → **Game bars** can instead group segments on the left: preferred,
  pending preferred, fills, pending fill. This device-only preference preserves
  the counts and original game details on hover.
- **Swaps** compares the planned five with the active or most recent game.
  Players staying in are omitted even if they change roles. Substitutions prefer
  matching role groups, then exact roles. The copyable message uses BattleTags
  without numeric suffixes, falling back to display names.

### Autofill

**Finish scrim** hides the upcoming game without deleting the lineup, draft, or
history. **Reopen scrim** brings it back. Finish or cancel an active game first;
reopening or undoing a completed game also reopens the scrim.

The **Bans on/off** button beside **Edit map pool** toggles hero bans for the
current scrim. Turning bans off hides the controls and omits bans from new games,
without deleting existing recorded bans. Reusing a scrim's setup copies this setting.

Autofill preserves existing selections, including manually chosen off-role or
absent players. New selections must be present, distinct, and opted into their
assigned roles. It is disabled when a complete valid lineup is impossible;
hover the button for the reason.

Complete options are ranked by:
1. Weighted preferred-playtime fairness: maximize `priority / (preferred games + 1)` for each main-role assignment; fills contribute zero.
2. Unweighted preferred-playtime fairness: maximize `1 / (preferred games + 1)`.
3. Number of trials receiving main-role assignments.
4. Reduction in squared imbalance across each player's main Tank / DPS / Support groups.
5. Minimize the sum of `previous fills + 1` for each proposed fill.
6. Reduction in squared imbalance between main subroles within DPS or Support.
7. Uniform random choice among exactly tied assignments.

The priority control beside each player's name opens a snapped slider:
⅕×, ¼×, ⅓×, ½×, ⅔×, 1×, 1.5×, 2×, 3×, 4×, 5×. It defaults to 1×, applies only to
that scrim, and is included in scrim exports. New scrims (including reused
rosters) and removed/re-added players start neutral. Non-neutral priorities
appear as badges; right-click the control to reset to neutral. Row sorting and actual game counts are unchanged.
Both fairness scores use exact BigInt common-denominator arithmetic, not
floating-point approximations. Multiplying all priorities by the same factor
preserves ranking and ties; role constraints may prevent proportional playtime.

Completed and in-progress games both count, classified using current role preferences.
Any historical assignment outside current main roles counts as a fill, including
manual unlisted assignments. Fills consume no preferred-playtime credit and do not
contribute to main-role balance. Actual game statistics still include every game.
Role balance rewards improvement,
not an already-balanced history. Scoring uses exact integer arithmetic and a
dynamic program over empty-slot subsets. Undo and retry may produce another
equally good lineup, but can repeat one.

## Player directory and notes

The book icon opens directory management. Search names, BattleTags, roles,
statuses, or notes; copy BattleTags; and create, edit, or delete players.
Players created here are not automatically added to the current scrim.

Click a role button to cycle **Unlisted → Main → Fill → Unlisted**; changes save
immediately. Main roles use filled
badges; fills use outlined badges. Clicking a player offers only main roles;
choose a slot first or drag to explicitly assign a fill. A player may have only
fill roles. Existing role selections remain mains. Statuses are **Default**,
**Trial**, **Team member**, and **Ringer**. Ringers have a magenta badge; only
trials receive special sorting/autofill priority.

**Add player** is the separate roster picker. Additions save immediately.
Unchecking players queues removal; Done, Escape, the close button, or clicking
outside asks for one bulk confirmation. Cancelling keeps those players;
rechecking cancels a pending removal. Removing someone from a scrim keeps their
directory entry. Deleting a directory player removes them from every saved
scrim's roster and lineup, but preserves historical game snapshots.

Directory rows show one-line notes; players with notes have a note icon in the
scrim roster. Hover or keyboard-focus either for an immediate preview, or click
to edit notes directly. Player details and notes save as you type.

## Maps, bans, and history

Cards distinguish **Upcoming**, **In progress**, and **Completed**, with map/hero
images and the recorded five. Click maps or bans to change them; right-click to
clear them. **Edit** also corrects recorded players and results. Historical
lineup corrections update playtime without changing the current lineup.

Known maps set their mode automatically. A mode heading opens its filtered
picker. Search supports abbreviations, partial names, and small typos; arrow
keys and Enter work too. Custom maps have a separate mode selector.

Red warnings flag repeated maps, repeated modes in the current rotation,
repeated bans by the same team, and both teams banning heroes of the same role
in one game. Conflicting picker options sort last but remain selectable. The
mode tracker uses completed games and resets after all five modes have appeared.

**Edit map pool** controls which maps appear in this scrim's pickers without
changing existing records. **All / None** toggle selections; **+ Save pool**
creates a reusable preset. Clicking a preset copies its selections into the
scrim; later changes are independent. Its **⋯** menu offers rename and delete.

Completed cards appear newest-first. The horizontal overview runs from Game 1
onward; clicking an entry scrolls to and briefly highlights its card.
The latest completed game can be marked in progress again. **Undo game** removes
the last completed game and restores its map/bans to the upcoming draft.
**Back to upcoming** cancels a start, protecting separately prepared next-game settings.

Wide landscape windows have independently scrolling roster and game panels with
a draggable divider. Narrow or portrait windows stack the panels.

## Saved scrims and settings

Click **▾** beside the scrim name to switch scrims, create a blank one, or reuse
the current roster and map pool. Reusing a setup resets attendance and starts
without games or a lineup. Previous scrims, including active games, stay saved.
The **⋯** menu renames or deletes a scrim; the last scrim cannot be deleted.
Up to 100 scrims can be saved.

Each scrim owns its contact, attendance, lineup, map pool, draft, and history.
The directory, pool presets, and custom game code are shared. Settings lets you
override the default code, `DKEEH`; a blank value restores it. The theme defaults
to charcoal dark. Theme and divider position stay device-local, outside transfers.

### Shift-click shortcuts

Hold **Shift** to see shortcut labels and highlights:
- **Swaps → Copy swaps** copies directly. No substitutions leaves the clipboard
  unchanged; a clipboard error opens the message for manual copying.
- Individual player, scrim, and saved-pool delete buttons skip confirmation.
  Text buttons show **Delete now**; directory trash buttons highlight pink.
- Roster-picker **Done → Remove now** applies pending removals without confirmation.
  Escape and outside-click still confirm.

Shift never enables disabled actions or bypasses the typed delete-all confirmation.

## Saving, sharing, and recovery

Changes save automatically in browser `localStorage`. Different devices,
browsers, origins, and private browsing sessions have separate storage. Clearing
site data removes local saves. Data is not sent to GitHub; there is no live
collaboration or automatic cross-device synchronization. Export regularly.

**Export** offers Player directory, Scrims, Map pool presets, and Custom game
code. Custom code starts unchecked. Scrims cannot be selected without the
directory; unchecking the directory also unchecks scrims.

**Import** previews changes before you apply them. Included categories default
to **Replace**:
- **Replace** replaces the entire category.
- **Merge** adds new IDs and updates matching IDs without removing unrelated
  entries. Available for players, scrims, and presets.
- **Skip**, or a category absent from the file, leaves it unchanged.

Importing scrims requires importing players. Replacing players also requires
replacing scrims or explicitly clearing them. Player updates affect retained
scrims using those players. Conflicting preset names must be resolved before
merging. The combined result is validated and saved together.

Player and scrim UUIDs survive transfers; names are not used to match identities.
V1 is the supported data format. An unsupported or unreadable save opens a blocking dialog
with **Start fresh** and **Import backup**. Nothing is cleared until you
explicitly reset or apply a valid import. Start fresh clears this app's data
and preferences on this browser; it does not affect other sites.

Another tab changing saved data pauses writes in the current tab: reload
before continuing. **Delete all saved data** in settings requires typing
`delete everything`.

See [DATA_FORMAT.md](DATA_FORMAT.md) for the v1 storage and export contract.

## Development and deployment

Serve the folder locally:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://localhost:4173>. Use an HTTP server rather than opening `index.html`
directly because the app uses JavaScript modules. Keep the same hostname and port
to access the same browser storage.

Run tests with Node.js 22 or newer; no dependency installation is needed:

```sh
node --test tests/*.test.js
```

GitHub Pages uses **Settings → Pages → GitHub Actions**. Pushing to `master`
runs tests and deploys through [.github/workflows/pages.yml](.github/workflows/pages.yml);
the workflow also supports manual runs. The artifact contains the static app,
bundled assets, and license/asset notices. Paths are relative for repository-subpath
hosting. Never commit roster backups or secrets.

To move local data to the hosted app, export locally and import on the website.
Deployments do not erase browser saves. Catalog sources and update instructions
are documented in [ASSETS.md](ASSETS.md).

## License and attribution

Original code, documentation, and original UI artwork are dual-licensed under
[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE), at your option. These licenses
permit commercial reuse of the original project materials; this hosted fan tool
is provided free of charge.

**Third-party hero and map images are excluded from both licenses.** No rights
to Blizzard artwork or trademarks are granted by this project. See [license
scope](LICENSE) and [asset sources and policies](ASSETS.md) before reusing them.
Scrims Helper is unofficial and is not affiliated with, endorsed, or sponsored
by Blizzard Entertainment.
