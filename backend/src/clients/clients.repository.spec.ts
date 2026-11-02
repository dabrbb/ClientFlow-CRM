import { Test } from '@nestjs/testing';
import { Client, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClientsRepository } from './clients.repository';

describe('ClientsRepository', () => {
  let repository: ClientsRepository;

  const prisma = {
    client: {
      findMany: jest.fn<Promise<Client[]>, [Prisma.ClientFindManyArgs]>(),
      count: jest.fn<Promise<number>, [Prisma.ClientCountArgs]>(),
    },
  };

  const paging = { skip: 20, take: 10, sort: 'createdAt', order: 'desc' } as const;

  const findManyArgs = () => prisma.client.findMany.mock.calls[0][0];
  const countArgs = () => prisma.client.count.mock.calls[0][0];

  const searchClause = (search: string): Prisma.ClientWhereInput[] => [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { phone: { contains: search, mode: 'insensitive' } },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.client.findMany.mockResolvedValue([]);
    prisma.client.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [ClientsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(ClientsRepository);
  });

  describe('createdAfter', () => {
    const createdAfter = new Date('2026-11-02T07:00:00.000Z');

    it('filters with an inclusive lower bound (gte, not gt)', async () => {
      await repository.findAll({ ...paging, createdAfter });

      expect(findManyArgs().where).toEqual({ createdAt: { gte: createdAfter } });
    });

    it('sends the same where to the list query and the count query', async () => {
      const filters = { search: 'alex', status: ClientStatus.ACTIVE, createdAfter };

      await repository.findAll({ ...paging, ...filters });
      await repository.count(filters);

      expect(countArgs().where).toEqual(findManyArgs().where);
      expect(countArgs().where).toEqual({
        OR: searchClause('alex'),
        status: ClientStatus.ACTIVE,
        createdAt: { gte: createdAfter },
      });
    });

    it('does not touch createdAt when the filter is absent', async () => {
      await repository.findAll({ ...paging, search: 'alex', status: ClientStatus.LEAD });

      expect(findManyArgs().where).toEqual({
        OR: searchClause('alex'),
        status: ClientStatus.LEAD,
      });
      expect(findManyArgs().where).not.toHaveProperty('createdAt');
    });
  });

  describe('existing behavior', () => {
    it('builds an empty where without filters', async () => {
      await repository.findAll(paging);
      await repository.count({});

      expect(findManyArgs().where).toEqual({});
      expect(countArgs().where).toEqual({});
    });

    it('filters by search only', async () => {
      await repository.count({ search: 'alex' });

      expect(countArgs().where).toEqual({ OR: searchClause('alex') });
    });

    it('filters by status only', async () => {
      await repository.count({ status: ClientStatus.LOST });

      expect(countArgs().where).toEqual({ status: ClientStatus.LOST });
    });

    it('passes paging and ordering to the list query only', async () => {
      await repository.findAll({ ...paging, sort: 'name', order: 'asc' });
      await repository.count({});

      expect(findManyArgs()).toEqual({ where: {}, skip: 20, take: 10, orderBy: { name: 'asc' } });
      expect(countArgs()).toEqual({ where: {} });
    });
  });
});
