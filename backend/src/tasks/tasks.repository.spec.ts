import { Test } from '@nestjs/testing';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TasksRepository, TaskWithRelations } from './tasks.repository';

describe('TasksRepository', () => {
  let repository: TasksRepository;

  const prisma = {
    task: {
      findMany: jest.fn<Promise<TaskWithRelations[]>, [Prisma.TaskFindManyArgs]>(),
      findFirst: jest.fn<Promise<TaskWithRelations | null>, [Prisma.TaskFindFirstArgs]>(),
      count: jest.fn<Promise<number>, [Prisma.TaskCountArgs]>(),
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

  // A task without a deal stays; a task with a deal is hidden together with an archived client.
  const notArchived = {
    AND: [{ OR: [{ dealId: null }, { deal: { client: { deletedAt: null } } }] }],
  };

  describe('findAll', () => {
    it('orders by creation time, newest first', async () => {
      await repository.findAll();

      expect(findManyArgs().orderBy).toEqual({ createdAt: 'desc' });
    });

    it('includes the assignee and the deal with only the public fields', async () => {
      await repository.findAll();

      expect(findManyArgs().include).toEqual(relations);
    });

    it('has only the archive condition without filters', async () => {
      await repository.findAll();
      await repository.findAll({});
      await repository.findAll({ assigneeId: undefined });

      for (const [args] of prisma.task.findMany.mock.calls) {
        expect(args.where).toEqual(notArchived);
      }
    });

    it('filters by assigneeId', async () => {
      await repository.findAll({ assigneeId: 7 });

      expect(findManyArgs().where).toEqual({ ...notArchived, assigneeId: 7 });
    });

    it('compares assigneeId with undefined, not by truthiness', async () => {
      await repository.findAll({ assigneeId: 0 });

      expect(findManyArgs().where).toEqual({ ...notArchived, assigneeId: 0 });
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

      expect(findManyArgs().where).toEqual({ ...notArchived, OR: seenBy7 });
    });

    it('combines with the assignee filter instead of replacing it', async () => {
      await repository.findAll({ visibleTo: 7, assigneeId: 7 });

      expect(findManyArgs().where).toEqual({ ...notArchived, assigneeId: 7, OR: seenBy7 });
    });

    it('adds no restriction when undefined', async () => {
      await repository.findAll({ visibleTo: undefined });

      expect(findManyArgs().where).toEqual(notArchived);
    });

    it('keeps user id 0 as a real restriction', async () => {
      await repository.findAll({ visibleTo: 0 });

      expect(findManyArgs().where).toEqual({
        ...notArchived,
        OR: [
          { deal: { client: { managers: { some: { userId: 0 } } } } },
          { dealId: null, assigneeId: 0 },
        ],
      });
    });
  });

  describe('findById', () => {
    it('looks up by id, hides tasks of archived clients and includes the relations', async () => {
      await repository.findById(5);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 5, ...notArchived },
        include: relations,
      });
    });

    it('also requires the task to be visible to the user', async () => {
      await repository.findById(5, 7);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 5,
          ...notArchived,
          OR: [
            { deal: { client: { managers: { some: { userId: 7 } } } } },
            { dealId: null, assigneeId: 7 },
          ],
        },
        include: relations,
      });
    });
  });

  describe('count', () => {
    it('counts everything except tasks of archived clients by default', async () => {
      prisma.task.count.mockResolvedValue(4);

      await expect(repository.count()).resolves.toBe(4);
      expect(prisma.task.count).toHaveBeenCalledWith({ where: notArchived });
    });

    it('combines assignee, visibility, statuses and a half-open due range', async () => {
      const dueFrom = new Date('2026-11-08T00:00:00.000Z');
      const dueBefore = new Date('2026-11-09T00:00:00.000Z');
      prisma.task.count.mockResolvedValue(1);

      await repository.count({
        assigneeId: 7,
        visibleTo: 7,
        statuses: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
        dueFrom,
        dueBefore,
      });

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          ...notArchived,
          assigneeId: 7,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          dueDate: { gte: dueFrom, lt: dueBefore },
          OR: [
            { deal: { client: { managers: { some: { userId: 7 } } } } },
            { dealId: null, assigneeId: 7 },
          ],
        },
      });
    });
  });
  describe('archived clients', () => {
    it('hide their deal tasks from every read, whoever asks', async () => {
      await repository.findAll({ visibleTo: 7 });
      await repository.findAll();
      await repository.findById(5, 7);
      await repository.findById(5);
      await repository.count({ visibleTo: 7, assigneeId: 7 });
      await repository.count();

      const wheres = [
        prisma.task.findMany.mock.calls[0][0].where,
        prisma.task.findMany.mock.calls[1][0].where,
        prisma.task.findFirst.mock.calls[0][0].where,
        prisma.task.findFirst.mock.calls[1][0].where,
        prisma.task.count.mock.calls[0][0].where,
        prisma.task.count.mock.calls[1][0].where,
      ];

      for (const where of wheres) {
        expect(where).toMatchObject(notArchived);
      }
    });

    it('never hide a task that has no deal', () => {
      expect(notArchived.AND[0].OR).toContainEqual({ dealId: null });
    });
  });
});
