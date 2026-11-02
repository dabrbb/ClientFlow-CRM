import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TasksRepository, TaskWithRelations } from './tasks.repository';

describe('TasksRepository', () => {
  let repository: TasksRepository;

  const prisma = {
    task: {
      findMany: jest.fn<Promise<TaskWithRelations[]>, [Prisma.TaskFindManyArgs]>(),
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
});
