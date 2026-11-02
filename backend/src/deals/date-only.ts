// expectedCloseDate is a calendar day stored in a Postgres DATE column. Prisma reads and writes
// it as a Date at 00:00 UTC, so both directions use UTC explicitly: the time zone of the server
// can never shift the day.

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// undefined stays undefined (field not sent), null stays null (clear it), a string becomes a Date.
export function parseOptionalDateOnly(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : parseDateOnly(value);
}
