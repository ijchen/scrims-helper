# Map and hero catalog

## Rights and attribution

The files in `assets/heroes/` and `assets/maps/` are excluded from the project's
MIT OR Apache-2.0 licensing. Artwork and screenshots are © Blizzard Entertainment
and their respective rights holders. All rights reserved. This project does
not grant a sublicense to these materials or claim that they are open source.
Overwatch™ and Battle.net® are trademarks or registered trademarks of Blizzard
Entertainment, Inc. in the U.S. and/or other countries.

Scrims Helper is an unofficial, free community tool, not affiliated with,
endorsed, or sponsored by Blizzard Entertainment. The original favicon and
code-drawn UI graphics are covered by the project's own [licenses](LICENSE).

Relevant policies: [Blizzard Legal FAQ](https://www.blizzard.com/en-sg/legal/c1ae32ac-7ff9-4ac3-a03b-fc04b8697010/blizzard-legal-faq),
[logo and trademark guidelines](https://www.blizzard.com/en-us/legal/8bcb0794-6641-4ce3-a573-8eb243bab342/blizzard-entertainment-logo-and-trademark-guidelines),
and [copyright notices](https://www.blizzard.com/en-us/legal/5515ca11-1c96-42a0-b853-e7876a0d19bf/copyright-notices).
These policies have conditions and may change; attribution alone does not
establish permission for every use. No project-specific written permission
has been obtained. Reusers should assess the policies for their own use,
including redistribution or commercial use, rather than rely on our software
licenses. OverFast's software license does not relicense Blizzard artwork.

## Sources

`catalog.js` and `assets/` are a local snapshot retrieved on 2026-09-27. The app does not call an external API or image host at runtime. The catalog is not a tournament map-pool declaration or a guarantee that every listed hero is currently enabled in competition.

- Map names, mode mappings, and screenshots: [OverFast maps endpoint](https://overfast-api.tekrop.fr/maps).
- Hero names, roles, and portrait URLs: [OverFast heroes endpoint](https://overfast-api.tekrop.fr/heroes). The portraits are Blizzard artwork served through the URLs supplied by the API.
- Neon Junction image: [OverFast's repository copy](https://github.com/TeKrop/overfast-api/blob/main/static/maps/neon-junction.jpg), retrieved on 2026-09-28 because the API's image URL returned 404.
- Watchpoint: Grímsvötn added on 2026-10-08, with its Escort mode from OverFast and [screenshot from OverFast's repository](https://github.com/TeKrop/overfast-api/blob/main/static/maps/watchpoint-grimsvotn.jpg) because the API's image URL returned 404. Name and release confirmed by [Blizzard's Season 5 announcement](https://overwatch.blizzard.com/en-us/news/24303008/).
- [OverFast project](https://github.com/TeKrop/overfast-api) and [official Overwatch hero gallery](https://overwatch.blizzard.com/en-us/heroes/).

Only the five scrim modes (Control, Push, Hybrid, Escort, Flashpoint) are included. Stadium-only locations are omitted. Map and hero artwork belongs to Blizzard Entertainment; this is an unofficial fan tool, not an official Blizzard product. No OverFast application code is incorporated.

To update the snapshot, edit the entries in `catalog.js`, download corresponding images under `assets/maps` or `assets/heroes`, and run `node --test tests/*.test.js`. Keep image paths relative for GitHub Pages. Unknown/custom names from old backups are retained and can be replaced through the picker; custom maps can have their mode set in the game editor.
