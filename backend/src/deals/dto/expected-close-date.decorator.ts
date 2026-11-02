import { applyDecorators } from '@nestjs/common';
import { IsISO8601, IsOptional, Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Strictly YYYY-MM-DD, or null. The pattern rejects every date-time and every other ISO 8601 form;
// the strict ISO check rejects days that do not exist (2026-02-30) and the year 0000.
export const IsExpectedCloseDate = () =>
  applyDecorators(
    IsOptional(),
    Matches(DATE_ONLY, { message: 'expectedCloseDate must be a date in YYYY-MM-DD format' }),
    IsISO8601(
      { strict: true, strictSeparator: true },
      { message: 'expectedCloseDate must be a real calendar date' },
    ),
  );
