const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function easternInput(instant) {
  const parts = Object.fromEntries(eastern.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromEasternInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time.');
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== value) throw new Error('Choose a valid date and time.');
  const candidates = new Set();
  for (const hours of [-24, 0, 24]) {
    const sample = wallTime + hours * 3600000;
    const offset = Date.parse(`${easternInput(sample)}:00Z`) - sample;
    const candidate = wallTime - offset;
    if (easternInput(candidate) === value) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error('That time does not exist in Eastern time because the clocks move forward.');
  return new Date(Math.min(...candidates)).toISOString();
}

export function defaultScrimTime(now = new Date()) {
  return fromEasternInput(`${easternInput(now).slice(0, 10)}T20:00`);
}

export function scrimTimeLabel(instant) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(instant));
}

export function discordTimestamp(instant) {
  return `<t:${Math.floor(new Date(instant).getTime() / 1000)}:t>`;
}
