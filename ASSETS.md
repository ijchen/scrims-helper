# Map and hero catalog

`catalog.js` and `assets/` are a local snapshot retrieved on 2026-09-27. The app does not call an external API or image host at runtime. The catalog is not a tournament map-pool declaration or a guarantee that every listed hero is currently enabled in competition.

- Map names, mode mappings, and screenshots: [OverFast maps endpoint](https://overfast-api.tekrop.fr/maps).
- Hero names, roles, and portrait URLs: [OverFast heroes endpoint](https://overfast-api.tekrop.fr/heroes). The portraits are Blizzard artwork served through the URLs supplied by the API.
- Neon Junction image: the header image from Blizzard's [Neon Junction developer recap](https://overwatch.blizzard.com/en-us/news/24293050/weekly-recall-neon-junction-ama-recap/), used because the catalog screenshot URL was unavailable.
- [OverFast project](https://github.com/TeKrop/overfast-api) and [official Overwatch hero gallery](https://overwatch.blizzard.com/en-us/heroes/).

Only the five scrim modes (Control, Push, Hybrid, Escort, Flashpoint) are included. Stadium-only locations are omitted. Map and hero artwork belongs to Blizzard Entertainment; this is an unofficial fan tool, not an official Blizzard product. No OverFast application code is incorporated.

To update the snapshot, edit the entries in `catalog.js`, download corresponding images under `assets/maps` or `assets/heroes`, and run `node --test tests/*.test.js`. Keep image paths relative for GitHub Pages. Unknown/custom names from old backups are retained and can be replaced through the picker; custom maps can have their mode set in the game editor.
