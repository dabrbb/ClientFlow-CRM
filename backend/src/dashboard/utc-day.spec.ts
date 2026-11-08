import { utcDayRange } from './utc-day';

// Run under several zones (TZ=Asia/Tokyo, TZ=America/New_York): the result must never change.
describe('utcDayRange', () => {
  it('returns the UTC day that contains the moment', () => {
    const { from, before } = utcDayRange(new Date('2026-11-08T16:54:00.000Z'));

    expect(from.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(before.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('includes the first millisecond of the day and excludes the first of the next', () => {
    const start = utcDayRange(new Date('2026-11-08T00:00:00.000Z'));
    const end = utcDayRange(new Date('2026-11-08T23:59:59.999Z'));

    expect(start.from.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(end.from.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(utcDayRange(end.before).from.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('crosses month and year boundaries', () => {
    const { from, before } = utcDayRange(new Date('2026-12-31T12:00:00.000Z'));

    expect(from.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(before.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('uses the UTC day, not the local one, for a moment near midnight', () => {
    // 23:30 on the 8th in UTC-5 is already the 9th in UTC.
    const { from } = utcDayRange(new Date('2026-11-09T04:30:00.000Z'));

    expect(from.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });
});
