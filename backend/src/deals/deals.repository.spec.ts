import { Test } from '@nestjs/testing';
import { DealStage, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { DealsRepository, DealWithClient } from './deals.repository';

describe('DealsRepository', () => {
  let repository: DealsRepository;

  const prisma = {
    deal: {
      create: jest.fn<Promise<DealWithClient>, [Prisma.DealCreateArgs]>(),
      findFirst: jest.fn<Promise<DealWithClient | null>, [Prisma.DealFindFirstArgs]>(),
      findMany: jest.fn<Promise<DealWithClient[]>, [Prisma.DealFindManyArgs]>(),
      update: jest.fn<Promise<DealWithClient>, [Prisma.DealUpdateArgs]>(),
      groupBy: jest.fn<Promise<unknown>, [{ where: Prisma.DealWhereInput }]>(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [DealsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(DealsRepository);
  });

  // Deals carry no archive flag: they are hidden through the client's deletedAt.
  const ofActiveClient = { client: { deletedAt: null } };

  it('create passes the data through and includes the client', async () => {
    const data: Prisma.DealCreateInput = {
      title: 'Big deal',
      client: { connect: { id: 3 } },
    };

    await repository.create(data);

    expect(prisma.deal.create.mock.calls[0][0]).toEqual({ data, include: { client: true } });
  });

  it('findById looks the deal up by id among non-archived clients and includes the client', async () => {
    await repository.findById(5);

    expect(prisma.deal.findFirst.mock.calls[0][0]).toEqual({
      where: { id: 5, ...ofActiveClient },
      include: { client: true },
    });
  });

  it('findAll includes the client and orders by creation time, newest first', async () => {
    prisma.deal.findMany.mockResolvedValue([]);

    await repository.findAll();

    expect(prisma.deal.findMany.mock.calls[0][0]).toEqual({
      where: ofActiveClient,
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
    prisma.deal.findFirst.mockResolvedValue(null);

    await expect(repository.findById(999)).resolves.toBeNull();
  });

  describe('managerId', () => {
    const ofManager7 = { client: { deletedAt: null, managers: { some: { userId: 7 } } } };

    it('findAll limits deals to clients assigned to that manager', async () => {
      prisma.deal.findMany.mockResolvedValue([]);

      await repository.findAll({ managerId: 7 });

      expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual(ofManager7);
    });

    it('findAll adds no manager restriction without a manager, but still hides archived clients', async () => {
      prisma.deal.findMany.mockResolvedValue([]);

      await repository.findAll({ managerId: undefined });
      await repository.findAll({});

      expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual(ofActiveClient);
      expect(prisma.deal.findMany.mock.calls[1][0].where).toEqual(ofActiveClient);
    });

    it('findAll keeps manager id 0 as a real restriction', async () => {
      prisma.deal.findMany.mockResolvedValue([]);

      await repository.findAll({ managerId: 0 });

      expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual({
        client: { deletedAt: null, managers: { some: { userId: 0 } } },
      });
    });

    it('findById also requires the manager to be assigned to the deal client', async () => {
      await repository.findById(5, 7);

      expect(prisma.deal.findFirst.mock.calls[0][0]).toEqual({
        where: { id: 5, ...ofManager7 },
        include: { client: true },
      });
    });

    it('findById without a manager still excludes archived clients', async () => {
      await repository.findById(5);

      expect(prisma.deal.findFirst.mock.calls[0][0].where).toEqual({ id: 5, ...ofActiveClient });
    });
  });

  describe('statsByStage', () => {
    it('groups by stage and maps counts and sums, treating a null sum as 0', async () => {
      prisma.deal.groupBy.mockResolvedValue([
        { stage: DealStage.WON, _count: { _all: 2 }, _sum: { value: 150.5 } },
        { stage: DealStage.NEW, _count: { _all: 3 }, _sum: { value: null } },
      ] as never);

      const result = await repository.statsByStage();

      expect(result).toEqual([
        { stage: DealStage.WON, count: 2, valueSum: 150.5 },
        { stage: DealStage.NEW, count: 3, valueSum: 0 },
      ]);
      expect(prisma.deal.groupBy.mock.calls[0][0]).toEqual({
        by: ['stage'],
        where: ofActiveClient,
        _count: { _all: true },
        _sum: { value: true },
      });
    });

    it('limits the groups to the deals of clients the manager is assigned to', async () => {
      prisma.deal.groupBy.mockResolvedValue([] as never);

      await repository.statsByStage({ managerId: 7 });

      expect(prisma.deal.groupBy.mock.calls[0][0].where).toEqual({
        client: { deletedAt: null, managers: { some: { userId: 7 } } },
      });
    });
  });
  describe('archived clients', () => {
    it('are excluded from every read, for a manager and for an admin alike', async () => {
      prisma.deal.findMany.mockResolvedValue([]);
      prisma.deal.groupBy.mockResolvedValue([] as never);

      await repository.findAll({ managerId: 7 });
      await repository.findAll();
      await repository.findById(5, 7);
      await repository.findById(5);
      await repository.statsByStage({ managerId: 7 });
      await repository.statsByStage();

      const wheres = [
        prisma.deal.findMany.mock.calls[0][0].where,
        prisma.deal.findMany.mock.calls[1][0].where,
        prisma.deal.findFirst.mock.calls[0][0].where,
        prisma.deal.findFirst.mock.calls[1][0].where,
        prisma.deal.groupBy.mock.calls[0][0].where,
        prisma.deal.groupBy.mock.calls[1][0].where,
      ];

      for (const where of wheres) {
        expect(where).toMatchObject({ client: { deletedAt: null } });
      }
    });
  });
});
