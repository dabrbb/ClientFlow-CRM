import { ValidationPipe } from '@nestjs/common';
import { CreateDealDto } from './create-deal.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (body: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(body, { type: 'body', metatype: CreateDealDto });

const base = { title: 'Big deal', clientId: 3 };
const rejectedFor = { response: { statusCode: 400 } };

describe('CreateDealDto expectedCloseDate', () => {
  it('is optional', async () => {
    const result = await parse(base);

    expect(result).toBeInstanceOf(CreateDealDto);
    expect(result).toHaveProperty('expectedCloseDate', undefined);
  });

  it('accepts null, which means "no date"', async () => {
    await expect(parse({ ...base, expectedCloseDate: null })).resolves.toHaveProperty(
      'expectedCloseDate',
      null,
    );
  });

  it('accepts a YYYY-MM-DD date and keeps it as a string', async () => {
    await expect(parse({ ...base, expectedCloseDate: '2026-11-02' })).resolves.toHaveProperty(
      'expectedCloseDate',
      '2026-11-02',
    );
  });

  it('accepts a date in the past', async () => {
    await expect(parse({ ...base, expectedCloseDate: '2000-01-01' })).resolves.toHaveProperty(
      'expectedCloseDate',
      '2000-01-01',
    );
  });

  it.each<unknown>(['2026-02-30', '2026-11-02T10:00:00Z', '0000-01-01', 'abc', '', 20261102, []])(
    'rejects %j',
    async (value) => {
      await expect(parse({ ...base, expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    },
  );

  it('does not loosen the other rules', async () => {
    await expect(
      parse({ ...base, title: 'a', expectedCloseDate: '2026-11-02' }),
    ).rejects.toMatchObject(rejectedFor);
    await expect(
      parse({ ...base, expectedCloseDate: '2026-11-02', foo: 'bar' }),
    ).rejects.toMatchObject(rejectedFor);
  });
});
