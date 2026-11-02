import { ValidationPipe } from '@nestjs/common';
import { UpdateDealDto } from './update-deal.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const parse = async (body: Record<string, unknown>): Promise<unknown> =>
  pipe.transform(body, { type: 'body', metatype: UpdateDealDto });

const rejectedFor = { response: { statusCode: 400 } };

describe('UpdateDealDto expectedCloseDate', () => {
  it('stays undefined when not sent, which means "do not change it"', async () => {
    const result = await parse({ title: 'New title' });

    expect(result).toBeInstanceOf(UpdateDealDto);
    expect(result).toHaveProperty('expectedCloseDate', undefined);
  });

  it('accepts null, which means "clear the date"', async () => {
    await expect(parse({ expectedCloseDate: null })).resolves.toHaveProperty(
      'expectedCloseDate',
      null,
    );
  });

  it('accepts a YYYY-MM-DD date and keeps it as a string', async () => {
    await expect(parse({ expectedCloseDate: '2026-11-02' })).resolves.toHaveProperty(
      'expectedCloseDate',
      '2026-11-02',
    );
  });

  it('accepts a date in the past', async () => {
    await expect(parse({ expectedCloseDate: '2000-01-01' })).resolves.toHaveProperty(
      'expectedCloseDate',
      '2000-01-01',
    );
  });

  it('can be sent together with the other fields', async () => {
    await expect(
      parse({ title: 'New title', value: 10, stage: 'WON', expectedCloseDate: '2026-11-02' }),
    ).resolves.toMatchObject({ title: 'New title', expectedCloseDate: '2026-11-02' });
  });

  it.each<unknown>(['2026-02-30', '2026-11-02T10:00:00Z', '0000-01-01', 'abc', '', 20261102, []])(
    'rejects %j',
    async (value) => {
      await expect(parse({ expectedCloseDate: value })).rejects.toMatchObject(rejectedFor);
    },
  );

  it('does not loosen the other rules', async () => {
    await expect(parse({ expectedCloseDate: '2026-11-02', clientId: 4 })).rejects.toMatchObject(
      rejectedFor,
    );
    await expect(parse({ expectedCloseDate: '2026-11-02', stage: 'BOGUS' })).rejects.toMatchObject(
      rejectedFor,
    );
  });
});
