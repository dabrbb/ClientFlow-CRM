import { formatDateOnly, parseDateOnly, parseOptionalDateOnly } from './date-only';

// The result must not depend on the time zone of the machine. Run this suite under several
// zones as well: TZ=Asia/Tokyo npm test, TZ=America/New_York npm test.
describe('date-only helpers', () => {
  const days = ['2026-11-02', '2024-02-29', '2026-01-01', '2026-12-31', '0100-01-01', '9999-12-31'];

  describe('parseDateOnly', () => {
    it.each(days)('turns %s into midnight UTC of that day', (day) => {
      expect(parseDateOnly(day).toISOString()).toBe(`${day}T00:00:00.000Z`);
    });
  });

  describe('formatDateOnly', () => {
    it.each(days)('gives %s back after a round trip', (day) => {
      expect(formatDateOnly(parseDateOnly(day))).toBe(day);
    });

    it('reads the UTC day at both ends of a UTC day, never the local one', () => {
      expect(formatDateOnly(new Date('2026-11-02T00:00:00.000Z'))).toBe('2026-11-02');
      expect(formatDateOnly(new Date('2026-11-02T23:59:59.999Z'))).toBe('2026-11-02');
    });

    it('returns only the date, never a date-time', () => {
      expect(formatDateOnly(new Date('2026-11-02T00:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseOptionalDateOnly', () => {
    it('keeps undefined (the field was not sent)', () => {
      expect(parseOptionalDateOnly(undefined)).toBeUndefined();
    });

    it('keeps null (clear the date)', () => {
      expect(parseOptionalDateOnly(null)).toBeNull();
    });

    it('turns a string into midnight UTC', () => {
      expect(parseOptionalDateOnly('2026-11-02')?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });
  });
});
