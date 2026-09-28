import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MAPS, HEROES } from '../catalog.js';
import { searchCatalog, findCatalogItem } from '../search.js';
import { MODES } from '../model.js';

test('map and hero catalogs have unique identifiers and bundled images', () => {
  for (const collection of [MAPS, HEROES]) {
    assert.equal(new Set(collection.map(item => item.id)).size, collection.length);
    for (const item of collection) assert.ok(existsSync(new URL(`../${item.image}`, import.meta.url)), item.image);
  }
  for (const map of MAPS) assert.ok(MODES.includes(map.mode));
  for (const hero of HEROES) assert.ok(['tank', 'dps', 'support'].includes(hero.role));
});

test('fuzzy search matches punctuation, accents, aliases, substrings and typos', () => {
  for (const [query, expected] of [['kr', 'kings-row'], ['kings rw', 'kings-row'], ['gib', 'watchpoint-gibraltar'], ['nqs', 'new-queen-street'], ['paraiso', 'paraiso'], ['ilios', 'ilios']]) assert.equal(searchCatalog(MAPS, query)[0]?.id, expected, query);
  for (const [query, expected] of [['brig', 'brigitte'], ['brigtte', 'brigitte'], ['76', 'soldier-76'], ['lucio', 'lucio'], ['dva', 'dva'], ['ball', 'wrecking-ball'], ['trcaer', 'tracer']]) assert.equal(searchCatalog(HEROES, query)[0]?.id, expected, query);
  assert.equal(searchCatalog(HEROES, 'zzzzzzzz').length, 0);
  assert.equal(searchCatalog(MAPS, '').length, MAPS.length);
  assert.equal(findCatalogItem(MAPS, 'King’s Row').mode, 'Hybrid');
});
