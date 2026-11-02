import { ValidationPipe } from '@nestjs/common';
import { DealStage } from '@prisma/client';
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

describe('UpdateDealDto stage', () => {
  it('stays undefined when not sent, which means "do not change it"', async () => {
    await expect(parse({ title: 'New title' })).resolves.toHaveProperty('stage', undefined);
  });

  it.each(Object.values(DealStage))('accepts %s', async (stage) => {
    await expect(parse({ stage })).resolves.toHaveProperty('stage', stage);
  });

  it('rejects null', async () => {
    await expect(parse({ stage: null })).rejects.toMatchObject(rejectedFor);
  });

  it('lists the allowed stages in the error for null', async () => {
    await expect(parse({ stage: null })).rejects.toHaveProperty('response.message', [
      'stage must be one of the following values: NEW, QUALIFICATION, NEGOTIATION, WON, LOST',
    ]);
  });

  it('rejects null even when every other field is valid', async () => {
    await expect(
      parse({ title: 'New title', value: 10, expectedCloseDate: '2026-11-02', stage: null }),
    ).rejects.toMatchObject(rejectedFor);
  });

  it.each<unknown>(['done', 'BOGUS', '', 0, 1, [], {}, true])('still rejects %j', async (stage) => {
    await expect(parse({ stage })).rejects.toMatchObject(rejectedFor);
  });

  it('leaves the other fields alone: value null is still accepted', async () => {
    await expect(parse({ value: null })).resolves.toHaveProperty('value', null);
  });
});
