// Decorative UI icons. Controls provide their own accessible names.
const shapes = {
  "check": "<path d=\"m5 12 4 4L19 6\"/>",
  "minus": "<path d=\"M5 12h14\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "close": "<path d=\"m6 6 12 12M6 18 18 6\"/>",
  "down": "<path d=\"m6 9 6 6 6-6\"/>",
  "arrowDown": "<path d=\"M12 4v16m-6-6 6 6 6-6\"/>",
  "arrowRight": "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>",
  "arrowUpRight": "<path d=\"M6 18 18 6H7m11 0v11\"/>",
  "warning": "<path d=\"m12 3 10 18H2L12 3Z M12 8.5v5.5\"/><circle cx=\"12\" cy=\"17.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>",
  "alert": "<g fill=\"currentColor\" stroke=\"none\"><rect x=\"9.5\" y=\"2\" width=\"5\" height=\"12\" rx=\"1.5\"/><circle cx=\"12\" cy=\"19.5\" r=\"2.5\"/></g>",
  "dot": "<circle cx=\"12\" cy=\"12\" r=\"4\" fill=\"currentColor\" stroke=\"none\"/>",
  "more": "<g fill=\"currentColor\" stroke=\"none\"><circle cx=\"5\" cy=\"12\" r=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><circle cx=\"19\" cy=\"12\" r=\"2\"/></g>",
  "moon": "<path d=\"M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5\"/>",
  "settings": "<path d=\"M10.033 4.659L10.608 2.097L13.392 2.097L13.967 4.659L15.800 5.418L18.018 4.014L19.986 5.982L18.582 8.200L19.341 10.033L21.903 10.608L21.903 13.392L19.341 13.967L18.582 15.800L19.986 18.018L18.018 19.986L15.800 18.582L13.967 19.341L13.392 21.903L10.608 21.903L10.033 19.341L8.200 18.582L5.982 19.986L4.014 18.018L5.418 15.800L4.659 13.967L2.097 13.392L2.097 10.608L4.659 10.033L5.418 8.200L4.014 5.982L5.982 4.014L8.200 5.418Z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/>",
  "undo": "<path d=\"M4 4v6h6M4 10a8 8 0 1 1 1 9\"/>",
  "map": "<path d=\"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15\"/>",
  "ban": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m6 18 12-12\"/>",
  "heart": "<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z\"/>"
};

export function uiIcon(name, size = 17) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
}
