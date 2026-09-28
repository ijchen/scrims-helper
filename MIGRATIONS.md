# Storage migration: Scrims Helper

Added September 28, 2026. Review/remove the temporary automatic legacy-key lookup on **October 12, 2026**, after two weeks. This is a code-maintenance date, not a runtime expiration: the app does not stop recovering saves or delete data based on the clock. Removal requires a follow-up code change and deployment.

## Current format

- Scrim data: `scrims-helper.state`, with JSON `version: 2`.
- Theme: `scrims-helper.theme`.
- Divider position: `scrims-helper.panelSplit`.
- The schema version is inside the data rather than embedded in the key, so future format changes do not need new storage keys.
- Saved lineup plans belonged to the removed Plans feature. Version 2 omits `session.plans`; attendance, players, roles, current lineup, map/bans, game outcomes, completed snapshots, and the in-progress snapshot are retained.
- Other fields retain their existing meaning. Historical role assignments are not inferred from today's player roles.

## Automatic migration

`storage.js` reads the current key first, and consults the old `scrimside.v1`, `scrimside.theme`, and `scrimside.panelSplit` keys only when their replacements are absent. The scrim is parsed and validated before the new format is written. Reloads never overwrite current data with old data. Malformed current data does not silently fall back to a stale legacy save.

Old entries remain untouched as recovery copies, including old saved plans. They are not updated after migration. A failed validation or storage write leaves the original available to the app's recovery export and blocks writes until the user explicitly imports or starts a new scrim. Preferences validate before copying; if saving a preference fails, its old value can still be used for that visit.

Both new and legacy state-key changes from other tabs trigger the existing storage-conflict warning. Close older tabs when switching to the new version. Migration is local to each browser/origin; localhost and GitHub Pages have separate saves, as before.

## Import/export compatibility

Exports now use version 2. Version 1 backups still import through `validateBackup`, filling missing historical defaults and omitting saved plans. Import confirmation explicitly mentions omitted plans when present. The original imported file is not modified. Keep legacy backup import support independently of the two-week automatic-key migration, so exported files remain recoverable after the old lookup is removed.

## October 12 cleanup checklist

1. Remove legacy key fallback and preference-copy logic from `storage.js`, and the legacy key from `isStateStorageKey`.
2. Remove `MIGRATION_REVIEW_DATE` and update migration-specific tests/documentation.
3. Keep new-key loading, schema validation, write-failure protection, and explicit v1 backup imports.
4. Do not automatically delete original legacy storage entries. They are recovery copies; manual cleanup is optional after exporting a current backup.
5. Run all tests and deploy only when requested.
