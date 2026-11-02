import { ValidationPipe } from '@nestjs/common';
import { GetClientsQueryDto } from './get-clients-query.dto';

// Same options as the global pipe in main.ts, so the query is converted and checked as in the app.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (query: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(query, { type: 'query', metatype: GetClientsQueryDto });

const rejectedFor = { response: { statusCode: 400 } };

describe('GetClientsQueryDto', () => {
  describe('createdAfter', () => {
    it.each([
      '2026-11-02',
      '2024-02-29',
      '2026-11-02T10:00Z',
      '2026-11-02T10:00:00Z',
      '2026-11-02T10:00:00.123Z',
      '2026-11-02T23:59:59.999Z',
      '2026-11-02T10:00:00+03:00',
      '2026-11-02T10:00:00-05:30',
      '2026-11-02T10:00:00+00:00',
    ])('accepts "%s"', async (value) => {
      await expect(parse({ createdAfter: value })).resolves.toMatchObject({ createdAfter: value });
    });

    it('is optional', async () => {
      const result = await parse({});

      expect(result).toBeInstanceOf(GetClientsQueryDto);
      expect(result).toHaveProperty('createdAfter', undefined);
    });

    it.each([
      // calendar and clock values that do not exist
      '2026-02-30',
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-11-32',
      '0000-01-01',
      '2026-11-02T25:00:00Z',
      '2026-11-02T10:60:00Z',
      '2026-11-02T10:00:60Z',
      // date-time without Z or offset would depend on the server time zone
      '2026-11-02T10:00:00',
      '2026-11-02T10:00',
      '2026-11-02T10:00:00.123',
      // invalid offsets
      '2026-11-02T10:00:00+24:00',
      '2026-11-02T10:00:00+25:00',
      '2026-11-02T10:00:00+99:99',
      '2026-11-02T10:00:00+03:60',
      '2026-11-02T10:00:00+3:00',
      '2026-11-02T10:00:00+03',
      '2026-11-02T10:00:00+0300',
      '2026-11-02T10:00:00++03:00',
      '2026-11-02T10:00:00z',
      '2026-11-02T10:00:00ZZ',
      // valid ISO 8601 forms that are not YYYY-MM-DD based
      '20261102',
      '2026-W44',
      '2026-306',
      // not dates at all, or badly formatted
      '2026-11-02 10:00:00Z',
      '2026-2-3',
      ' 2026-11-02',
      'abc',
      '',
    ])('rejects "%s"', async (value) => {
      await expect(parse({ createdAfter: value })).rejects.toMatchObject(rejectedFor);
    });

    it('rejects a repeated parameter (an array)', async () => {
      await expect(parse({ createdAfter: ['2026-11-02', '2026-11-03'] })).rejects.toMatchObject(
        rejectedFor,
      );
    });

    it('mentions createdAfter in the error', async () => {
      await expect(parse({ createdAfter: 'abc' })).rejects.toHaveProperty(
        'response.message',
        expect.arrayContaining([
          expect.stringMatching(/^createdAfter must be YYYY-MM-DD or an ISO 8601 date-time/),
        ]),
      );
    });
  });

  describe('existing parameters', () => {
    it('keep their defaults when createdAfter is absent', async () => {
      await expect(parse({})).resolves.toMatchObject({
        page: 1,
        limit: 10,
        sort: 'createdAt',
        order: 'desc',
      });
    });

    it('are converted and kept as before when createdAfter is present', async () => {
      await expect(
        parse({
          createdAfter: '2026-11-02',
          search: 'alex',
          status: 'ACTIVE',
          sort: 'name',
          order: 'asc',
          page: '2',
          limit: '25',
        }),
      ).resolves.toMatchObject({
        createdAfter: '2026-11-02',
        search: 'alex',
        status: 'ACTIVE',
        sort: 'name',
        order: 'asc',
        page: 2,
        limit: 25,
      });
    });

    it('are still validated when createdAfter is valid', async () => {
      await expect(
        parse({ createdAfter: '2026-11-02', status: 'NOT_A_STATUS' }),
      ).rejects.toMatchObject(rejectedFor);
      await expect(parse({ createdAfter: '2026-11-02', limit: '1000' })).rejects.toMatchObject(
        rejectedFor,
      );
    });

    it('still reject unknown parameters', async () => {
      await expect(parse({ createdBefore: '2026-11-02' })).rejects.toMatchObject(rejectedFor);
    });
  });
});
