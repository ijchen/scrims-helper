export function localInput(instant) {
  const date = new Date(instant);
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time.');
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== value) throw new Error('Choose a valid date and time.');
  // ISO date-times without an offset use the device's timezone. Date chooses
  // the earlier occurrence of repeated times; reject normalized clock gaps.
  const instant = new Date(`${value}:00`);
  if (!Number.isFinite(instant.getTime()) || localInput(instant) !== value) throw new Error('That time does not exist in your local timezone because the clocks move forward.');
  return instant.toISOString();
}

export function defaultScrimTime(now = new Date()) {
  return fromLocalInput(`${localInput(now).slice(0, 10)}T20:00`);
}

export function scrimTimeLabel(instant) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(instant));
}

export function discordTimestamp(instant) {
  return `<t:${Math.floor(new Date(instant).getTime() / 1000)}:t>`;
}
