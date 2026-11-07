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
      findFirst: jest.fn<Promise<Client | null>, [Prisma.ClientFindFirstArgs]>(),
    },
    task: {
      count: jest.fn<Promise<number>, [Prisma.TaskCountArgs]>(),
    },
    clientManager: {
      count: jest.fn<Promise<number>, [Prisma.ClientManagerCountArgs]>(),
      create: jest.fn<Promise<unknown>, [Prisma.ClientManagerCreateArgs]>(),
      findMany: jest.fn<Promise<unknown[]>, [Prisma.ClientManagerFindManyArgs]>(),
      createMany: jest.fn<Promise<{ count: number }>, [Prisma.ClientManagerCreateManyArgs]>(),
      findUniqueOrThrow: jest.fn<Promise<unknown>, [Prisma.ClientManagerFindUniqueOrThrowArgs]>(),
      deleteMany: jest.fn<Promise<{ count: number }>, [Prisma.ClientManagerDeleteManyArgs]>(),
    },
    // Tagged-template call: the first argument is the array of SQL fragments.
    $queryRaw: jest.fn<Promise<{ id: number }[]>, [TemplateStringsArray, ...unknown[]]>(),
    // Runs the callback with this same mock as the transaction client.
    $transaction: jest.fn(),
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
    prisma.client.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) =>
      work(prisma),
    );

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

  describe('managerId', () => {
    const assignedTo7 = { managers: { some: { userId: 7 } } };

    it('limits the list and the count to clients assigned to that manager', async () => {
      await repository.findAll({ ...paging, managerId: 7 });
      await repository.count({ managerId: 7 });

      expect(findManyArgs().where).toEqual(assignedTo7);
      expect(countArgs().where).toEqual(assignedTo7);
    });

    it('combines with the other filters instead of replacing them', async () => {
      await repository.count({ managerId: 7, search: 'alex', status: ClientStatus.ACTIVE });

      expect(countArgs().where).toEqual({
        OR: searchClause('alex'),
        status: ClientStatus.ACTIVE,
        ...assignedTo7,
      });
    });

    it('adds nothing when no manager is given', async () => {
      await repository.count({ managerId: undefined });

      expect(countArgs().where).not.toHaveProperty('managers');
    });

    it('keeps manager id 0 as a real restriction instead of treating it as "no filter"', async () => {
      await repository.count({ managerId: 0 });

      expect(countArgs().where).toEqual({ managers: { some: { userId: 0 } } });
    });
  });

  describe('findById', () => {
    it('looks up by id alone when no manager is given', async () => {
      await repository.findById(5);

      expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('also requires the manager to be assigned when one is given', async () => {
      await repository.findById(5, 7);

      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: 5, managers: { some: { userId: 7 } } },
      });
    });
  });

  describe('pool', () => {
    const noManagers = { managers: { none: {} } };

    it('lists clients with no manager, oldest first, with only the public fields', async () => {
      await repository.findPool({ skip: 20, take: 10 });

      expect(findManyArgs()).toEqual({
        where: noManagers,
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        skip: 20,
        take: 10,
      });
    });

    it('counts with the same condition', async () => {
      await repository.countPool();

      expect(countArgs().where).toEqual(noManagers);
    });
  });

  describe('claim', () => {
    it('locks the client row before reading or writing anything else', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 5 }]);
      prisma.clientManager.count.mockResolvedValue(0);

      await repository.claim(5, 7);

      const [fragments, ...values] = prisma.$queryRaw.mock.calls[0];
      expect(fragments.join('?')).toMatch(/FROM "Client" WHERE "id" = \?\s+FOR UPDATE/);
      expect(values).toEqual([5]);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.clientManager.count.mock.invocationCallOrder[0],
      );
    });

    it('assigns the client to the caller when nobody has it, recording the caller as assigner', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 5 }]);
      prisma.clientManager.count.mockResolvedValue(0);

      await expect(repository.claim(5, 7)).resolves.toBe('claimed');
      expect(prisma.clientManager.count).toHaveBeenCalledWith({ where: { clientId: 5 } });
      expect(prisma.clientManager.create).toHaveBeenCalledWith({
        data: { clientId: 5, userId: 7, assignedById: 7 },
      });
    });

    it('reports "taken" and writes nothing when a manager already exists', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 5 }]);
      prisma.clientManager.count.mockResolvedValue(1);

      await expect(repository.claim(5, 7)).resolves.toBe('taken');
      expect(prisma.clientManager.create).not.toHaveBeenCalled();
    });

    it('reports "not_found" and goes no further when the client does not exist', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(repository.claim(5, 7)).resolves.toBe('not_found');
      expect(prisma.clientManager.count).not.toHaveBeenCalled();
      expect(prisma.clientManager.create).not.toHaveBeenCalled();
    });

    it('does everything inside one transaction', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await repository.claim(5, 7);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('managers of a client', () => {
    it('lists them with only id, name and role of each user, in the order they were added', async () => {
      prisma.clientManager.findMany.mockResolvedValue([]);

      await repository.findManagers(5);

      expect(prisma.clientManager.findMany).toHaveBeenCalledWith({
        where: { clientId: 5 },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { assignedAt: 'asc' },
      });
    });

    it('adds a manager without failing on a duplicate', async () => {
      prisma.clientManager.createMany.mockResolvedValue({ count: 1 });
      prisma.clientManager.findUniqueOrThrow.mockResolvedValue({ userId: 9 });

      await expect(repository.addManager(5, 9, 7)).resolves.toEqual({ userId: 9 });
      expect(prisma.clientManager.createMany).toHaveBeenCalledWith({
        data: [{ clientId: 5, userId: 9, assignedById: 7 }],
        skipDuplicates: true,
      });
      expect(prisma.clientManager.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { clientId_userId: { clientId: 5, userId: 9 } },
        include: { user: { select: { id: true, name: true, role: true } } },
      });
    });

    it('returns null for an already assigned user and reads nothing back', async () => {
      prisma.clientManager.createMany.mockResolvedValue({ count: 0 });

      await expect(repository.addManager(5, 9, 7)).resolves.toBeNull();
      expect(prisma.clientManager.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('removes exactly one client-user pair and says whether it existed', async () => {
      prisma.clientManager.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.clientManager.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(repository.removeManager(5, 9)).resolves.toBe(true);
      await expect(repository.removeManager(5, 9)).resolves.toBe(false);
      expect(prisma.clientManager.deleteMany).toHaveBeenCalledWith({
        where: { clientId: 5, userId: 9 },
      });
    });
  });
  describe('isAssigned', () => {
    it('checks the client-user pair and says yes when it exists', async () => {
      prisma.clientManager.count.mockResolvedValue(1);

      await expect(repository.isAssigned(5, 9)).resolves.toBe(true);
      expect(prisma.clientManager.count).toHaveBeenCalledWith({
        where: { clientId: 5, userId: 9 },
      });
    });

    it('says no when there is no such pair', async () => {
      prisma.clientManager.count.mockResolvedValue(0);

      await expect(repository.isAssigned(5, 9)).resolves.toBe(false);
    });
  });
  describe('countOpenTasks', () => {
    it('counts TODO and IN_PROGRESS tasks of the user on the deals of that client only', async () => {
      prisma.task.count.mockResolvedValue(2);

      await expect(repository.countOpenTasks(5, 9)).resolves.toBe(2);
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          assigneeId: 9,
          status: { in: ['TODO', 'IN_PROGRESS'] },
          deal: { clientId: 5 },
        },
      });
    });
  });
  describe('assignedTo', () => {
    const managedBy = (userId: number) => ({ managers: { some: { userId } } });

    it('limits the list and the count to clients that user is assigned to', async () => {
      await repository.findAll({ ...paging, assignedTo: 9 });
      await repository.count({ assignedTo: 9 });

      expect(findManyArgs().where).toEqual({ AND: [managedBy(9)] });
      expect(countArgs().where).toEqual({ AND: [managedBy(9)] });
    });

    it('is kept next to the visibility scope instead of overwriting it', async () => {
      await repository.count({ managerId: 7, assignedTo: 9 });

      expect(countArgs().where).toEqual({ ...managedBy(7), AND: [managedBy(9)] });
    });

    it('combines with the other filters', async () => {
      await repository.count({ assignedTo: 9, search: 'alex', status: ClientStatus.ACTIVE });

      expect(countArgs().where).toEqual({
        OR: searchClause('alex'),
        status: ClientStatus.ACTIVE,
        AND: [managedBy(9)],
      });
    });

    it('adds nothing when undefined', async () => {
      await repository.count({ assignedTo: undefined });

      expect(countArgs().where).toEqual({});
    });

    it('keeps user id 0 as a real condition', async () => {
      await repository.count({ assignedTo: 0 });

      expect(countArgs().where).toEqual({ AND: [managedBy(0)] });
    });
  });
});
