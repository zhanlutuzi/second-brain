// Dates in the vault are local calendar dates (YYYY-MM-DD).

const pad = (n) => String(n).padStart(2, '0');

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Take the calendar date as written in an ISO timestamp ("2026-10-28T08:20:11+08:00"),
// i.e. the sender's local date, without converting time zones.
export function datePart(value) {
  const m = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

// ISO timestamp in the machine's local time zone, e.g. 2026-10-28T08:20:11+08:00.
export function isoLocal(ms) {
  const d = new Date(Number(ms));
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
