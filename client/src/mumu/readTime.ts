// Text for the tap-to-see-read-time bubble (SPEC F8) and the `readingLog` key for today.

/** `readingLog` key: the local date as YYYY-MM-DD (CONTRACT §6). */
export function localDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "You've read 23 min today!" from the seconds in today's reading-log row (0 or undefined: nothing logged). */
export function readTimeMessage(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return "No reading yet today. Pick a story!";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "You've read less than a minute today!";
  if (minutes < 60) return `You've read ${minutes} min today!`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `You've read ${h} h today!` : `You've read ${h} h ${m} min today!`;
}
