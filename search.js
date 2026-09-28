export function normalizeSearch(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(first, second) {
  const rows = Array.from({ length: first.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= second.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      rows[row][column] = Math.min(rows[row - 1][column] + 1, rows[row][column - 1] + 1, rows[row - 1][column - 1] + Number(first[row - 1] !== second[column - 1]));
      if (row > 1 && column > 1 && first[row - 1] === second[column - 2] && first[row - 2] === second[column - 1]) rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + 1);
    }
  }
  return rows[first.length][second.length];
}

export function searchCatalog(items, query) {
  const normalized = normalizeSearch(query);
  if (!normalized) return [...items];
  const score = item => {
    const initials = item.name.split(/[\s:-]+/).map(word => word[0]).join('');
    return Math.min(...[item.name, item.id, initials, ...(item.aliases || [])].map(value => {
      const text = normalizeSearch(value);
      if (text === normalized) return 0;
      if (text.startsWith(normalized)) return 1 + (text.length - normalized.length) / 100;
      if (text.includes(normalized)) return 2 + text.indexOf(normalized) / 100;
      if (normalized.length < 3) return Infinity;
      const distance = editDistance(normalized, text);
      if (distance <= Math.max(1, Math.floor(normalized.length / 4))) return 3 + distance / 10;
      let position = 0;
      for (const character of text) if (character === normalized[position]) position += 1;
      return position === normalized.length ? 5 + (text.length - normalized.length) / 100 : Infinity;
    }));
  };
  return items.map(item => ({ item, score: score(item) })).filter(result => Number.isFinite(result.score)).sort((first, second) => first.score - second.score || first.item.name.localeCompare(second.item.name)).map(result => result.item);
}

export function findCatalogItem(items, value) {
  const normalized = normalizeSearch(value);
  return items.find(item => normalizeSearch(item.name) === normalized || normalizeSearch(item.id) === normalized);
}
