import { ValidationPipe } from '@nestjs/common';
import { IsExpectedCloseDate } from './expected-close-date.decorator';

class Probe {
  @IsExpectedCloseDate()
  expectedCloseDate?: string | null;
}

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (body: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(body, { type: 'body', metatype: Probe });

const rejectedFor = { response: { statusCode: 400 } };

describe('IsExpectedCloseDate', () => {
  it.each(['2026-11-02', '2024-02-29', '2026-01-01', '2026-12-31', '9999-12-31'])(
    'accepts %s and keeps it as a string',
    async (value) => {
      await expect(parse({ expectedCloseDate: value })).resolves.toHaveProperty(
        'expectedCloseDate',
        value,
      );
    },
  );

  it('accepts a missing value', async () => {
    await expect(parse({})).resolves.toHaveProperty('expectedCloseDate', undefined);
  });

  it('accepts null', async () => {
    await expect(parse({ expectedCloseDate: null })).resolves.toHaveProperty(
      'expectedCloseDate',
      null,
    );
  });

  describe('rejects', () => {
    it.each([
      // days that do not exist
      '2026-02-30',
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-11-32',
      '0000-01-01',
    ])('the non-existent day %s', async (value) => {
      await expect(parse({ expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    });

    it.each([
      '2026-11-02T00:00:00Z',
      '2026-11-02T00:00:00.000Z',
      '2026-11-02T10:00:00+03:00',
      '2026-11-02T10:00',
      '2026-11-02T10:00:00',
    ])('the date-time %s (no time, no time zone)', async (value) => {
      await expect(parse({ expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    });

    it.each([
      '2026-11-02 ',
      ' 2026-11-02',
      '2026-11-02\n',
      '20261102',
      '2026-W44',
      '2026-306',
      '2026-2-3',
      '26-11-02',
      '2026/11/02',
      '02-11-2026',
      '11/02/2026',
      '',
      ' ',
      'abc',
      'today',
    ])('the text %j', async (value) => {
      await expect(parse({ expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    });

    it.each<[string, unknown]>([
      ['a number', 20261102],
      ['a small number', 2026],
      ['zero', 0],
      ['a boolean', true],
      ['an array', ['2026-11-02']],
      ['an object', {}],
    ])('%s', async (_label, value) => {
      await expect(parse({ expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    });
  });

  describe('error messages', () => {
    const messagesOf = (value: unknown) =>
      expect(parse({ expectedCloseDate: value })).rejects.toHaveProperty('response.message');

    it('says the day is not real for a well-formed but impossible date', async () => {
      await expect(parse({ expectedCloseDate: '2026-02-30' })).rejects.toHaveProperty(
        'response.message',
        ['expectedCloseDate must be a real calendar date'],
      );
    });

    it('asks for YYYY-MM-DD for a date-time', async () => {
      await expect(parse({ expectedCloseDate: '2026-11-02T10:00:00Z' })).rejects.toHaveProperty(
        'response.message',
        expect.arrayContaining(['expectedCloseDate must be a date in YYYY-MM-DD format']),
      );
    });

    it('names the field for any rejected value', async () => {
      await messagesOf('abc');
    });
  });
});
