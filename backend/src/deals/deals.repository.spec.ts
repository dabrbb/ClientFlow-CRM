import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { DealsRepository, DealWithClient } from './deals.repository';

describe('DealsRepository', () => {
  let repository: DealsRepository;

  const prisma = {
    deal: {
      create: jest.fn<Promise<DealWithClient>, [Prisma.DealCreateArgs]>(),
      findUnique: jest.fn<Promise<DealWithClient | null>, [Prisma.DealFindUniqueArgs]>(),
      findMany: jest.fn<Promise<DealWithClient[]>, [Prisma.DealFindManyArgs]>(),
      update: jest.fn<Promise<DealWithClient>, [Prisma.DealUpdateArgs]>(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [DealsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(DealsRepository);
  });

  it('create passes the data through and includes the client', async () => {
    const data: Prisma.DealCreateInput = {
      title: 'Big deal',
      client: { connect: { id: 3 } },
    };

    await repository.create(data);

    expect(prisma.deal.create.mock.calls[0][0]).toEqual({ data, include: { client: true } });
  });

  it('findById looks the deal up by id and includes the client', async () => {
    await repository.findById(5);

    expect(prisma.deal.findUnique.mock.calls[0][0]).toEqual({
      where: { id: 5 },
      include: { client: true },
    });
  });

  it('findAll includes the client and orders by creation time, newest first', async () => {
    prisma.deal.findMany.mockResolvedValue([]);

    await repository.findAll();

    expect(prisma.deal.findMany.mock.calls[0][0]).toEqual({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('update targets the deal by id, passes the data and includes the client', async () => {
    const data: Prisma.DealUpdateInput = { title: 'New title' };

    await repository.update(5, data);

    expect(prisma.deal.update.mock.calls[0][0]).toEqual({
      where: { id: 5 },
      data,
      include: { client: true },
    });
  });

  it('create passes expectedCloseDate through unchanged', async () => {
    const expectedCloseDate = new Date('2026-11-02T00:00:00.000Z');

    await repository.create({
      title: 'Big deal',
      expectedCloseDate,
      client: { connect: { id: 3 } },
    });

    expect(prisma.deal.create.mock.calls[0][0].data.expectedCloseDate).toBe(expectedCloseDate);
  });

  it('update passes expectedCloseDate through, including null', async () => {
    const expectedCloseDate = new Date('2026-11-02T00:00:00.000Z');

    await repository.update(5, { expectedCloseDate });
    await repository.update(5, { expectedCloseDate: null });

    expect(prisma.deal.update.mock.calls[0][0].data.expectedCloseDate).toBe(expectedCloseDate);
    expect(prisma.deal.update.mock.calls[1][0].data.expectedCloseDate).toBeNull();
  });

  it('returns what Prisma returns', async () => {
    prisma.deal.findUnique.mockResolvedValue(null);

    await expect(repository.findById(999)).resolves.toBeNull();
  });
});
