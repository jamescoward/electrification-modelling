// Validate calendar fields explicitly: Date.parse alone normalises invalid days.
const iso =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const parsed = new Map<string, { milliseconds: number; submillis: number } | null>();
function timestamp(value: string) {
  if (parsed.has(value)) return parsed.get(value)!;
  const match = iso.exec(value);
  let result: { milliseconds: number; submillis: number } | null = null;
  if (match) {
    const year = Number(match[1]),
      month = Number(match[2]),
      day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const milliseconds = Date.parse(value);
    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= days[month - 1] &&
      Number.isFinite(milliseconds)
    )
      result = { milliseconds, submillis: Number((match[7] ?? '').padEnd(9, '0').slice(3)) };
  }
  if (parsed.size >= 100_000) parsed.clear();
  parsed.set(value, result);
  return result;
}
export function validTimestamp(value: string): boolean {
  return timestamp(value) !== null;
}
export function compareTimestamps(a: string, b: string): number {
  const x = timestamp(a),
    y = timestamp(b);
  if (!x || !y) return NaN;
  return x.milliseconds - y.milliseconds || x.submillis - y.submillis;
}
export function timestampIdentity(value: string): string {
  const x = timestamp(value);
  if (!x) throw new Error('Invalid source timestamp');
  return `${x.milliseconds}|${x.submillis}`;
}
