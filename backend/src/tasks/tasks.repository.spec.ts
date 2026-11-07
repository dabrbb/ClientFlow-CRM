import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TasksRepository, TaskWithRelations } from './tasks.repository';

describe('TasksRepository', () => {
  let repository: TasksRepository;

  const prisma = {
    task: {
      findMany: jest.fn<Promise<TaskWithRelations[]>, [Prisma.TaskFindManyArgs]>(),
      findFirst: jest.fn<Promise<TaskWithRelations | null>, [Prisma.TaskFindFirstArgs]>(),
    },
  };

  const relations = {
    assignee: { select: { id: true, name: true, email: true, role: true } },
    deal: { select: { id: true, title: true, stage: true, value: true } },
  };

  const findManyArgs = () => prisma.task.findMany.mock.calls[0][0];

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.findFirst.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [TasksRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(TasksRepository);
  });

  describe('findAll', () => {
    it('orders by creation time, newest first', async () => {
      await repository.findAll();

      expect(findManyArgs().orderBy).toEqual({ createdAt: 'desc' });
    });

    it('includes the assignee and the deal with only the public fields', async () => {
      await repository.findAll();

      expect(findManyArgs().include).toEqual(relations);
    });

    it('has an empty where without filters', async () => {
      await repository.findAll();
      await repository.findAll({});
      await repository.findAll({ assigneeId: undefined });

      for (const [args] of prisma.task.findMany.mock.calls) {
        expect(args.where).toEqual({});
      }
    });

    it('filters by assigneeId', async () => {
      await repository.findAll({ assigneeId: 7 });

      expect(findManyArgs().where).toEqual({ assigneeId: 7 });
    });

    it('compares assigneeId with undefined, not by truthiness', async () => {
      await repository.findAll({ assigneeId: 0 });

      expect(findManyArgs().where).toEqual({ assigneeId: 0 });
    });

    it('keeps ordering and relations when a filter is set', async () => {
      await repository.findAll({ assigneeId: 7 });

      expect(findManyArgs().orderBy).toEqual({ createdAt: 'desc' });
      expect(findManyArgs().include).toEqual(relations);
    });

    it('returns what Prisma returns', async () => {
      const rows: TaskWithRelations[] = [];
      prisma.task.findMany.mockResolvedValue(rows);

      await expect(repository.findAll()).resolves.toBe(rows);
    });
  });

  describe('visibleTo', () => {
    const seenBy7 = [
      { deal: { client: { managers: { some: { userId: 7 } } } } },
      { dealId: null, assigneeId: 7 },
    ];

    it('shows deal tasks of the clients the user is assigned to, and their own tasks without a deal', async () => {
      await repository.findAll({ visibleTo: 7 });

      expect(findManyArgs().where).toEqual({ OR: seenBy7 });
    });

    it('combines with the assignee filter instead of replacing it', async () => {
      await repository.findAll({ visibleTo: 7, assigneeId: 7 });

      expect(findManyArgs().where).toEqual({ assigneeId: 7, OR: seenBy7 });
    });

    it('adds no restriction when undefined', async () => {
      await repository.findAll({ visibleTo: undefined });

      expect(findManyArgs().where).toEqual({});
    });

    it('keeps user id 0 as a real restriction', async () => {
      await repository.findAll({ visibleTo: 0 });

      expect(findManyArgs().where).toEqual({
        OR: [
          { deal: { client: { managers: { some: { userId: 0 } } } } },
          { dealId: null, assigneeId: 0 },
        ],
      });
    });
  });

  describe('findById', () => {
    it('looks up by id alone and includes the relations', async () => {
      await repository.findById(5);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 5 },
        include: relations,
      });
    });

    it('also requires the task to be visible to the user', async () => {
      await repository.findById(5, 7);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 5,
          OR: [
            { deal: { client: { managers: { some: { userId: 7 } } } } },
            { dealId: null, assigneeId: 7 },
          ],
        },
        include: relations,
      });
    });
  });
});
