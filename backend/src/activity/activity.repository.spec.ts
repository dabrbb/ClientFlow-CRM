import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityRepository } from './activity.repository';

describe('ActivityRepository', () => {
  let repository: ActivityRepository;

  const prisma = {
    activityLog: {
      createMany: jest.fn<Promise<unknown>, [Prisma.ActivityLogCreateManyArgs]>(),
      findMany: jest.fn<Promise<unknown[]>, [Prisma.ActivityLogFindManyArgs]>(),
      count: jest.fn<Promise<number>, [Prisma.ActivityLogCountArgs]>(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.activityLog.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [ActivityRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(ActivityRepository);
  });

  it('is append-only: it offers no way to change or remove a record', () => {
    const methods = Object.getOwnPropertyNames(ActivityRepository.prototype);

    expect(methods.filter((name) => /update|delete|upsert|remove|destroy/i.test(name))).toEqual([]);
  });

  describe('createMany', () => {
    it('inserts every record in one call, all for the same user', async () => {
      await repository.createMany(2, [
        { action: 'ASSIGN', entity: 'Task', entityId: 4, details: { assigneeId: 9 } },
        { action: 'CLAIM', entity: 'Client', entityId: 5 },
      ]);

      expect(prisma.activityLog.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.activityLog.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 2,
            action: 'ASSIGN',
            entity: 'Task',
            entityId: 4,
            details: { assigneeId: 9 },
          },
          { userId: 2, action: 'CLAIM', entity: 'Client', entityId: 5, details: undefined },
        ],
      });
    });
  });

  describe('findAll', () => {
    const args = () => prisma.activityLog.findMany.mock.calls[0][0];

    it('sorts newest first with id as the tie-breaker, and pages with skip and take', async () => {
      await repository.findAll({}, 40, 20);

      expect(args().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(args().skip).toBe(40);
      expect(args().take).toBe(20);
    });

    it('includes only the public fields of the user', async () => {
      await repository.findAll({}, 0, 20);

      expect(args().include).toEqual({
        user: { select: { id: true, name: true, email: true, role: true } },
      });
    });

    it('does not restrict anything without filters', async () => {
      await repository.findAll({}, 0, 20);

      expect(args().where).toEqual({});
    });

    it('builds the where from every filter, with a half-open date range', async () => {
      const createdAfter = new Date('2026-11-01T00:00:00.000Z');
      const createdBefore = new Date('2026-11-08T00:00:00.000Z');

      await repository.findAll(
        { entity: 'Task', entityId: 4, action: 'ASSIGN', userId: 2, createdAfter, createdBefore },
        0,
        20,
      );

      expect(args().where).toEqual({
        entity: 'Task',
        entityId: 4,
        action: 'ASSIGN',
        userId: 2,
        createdAt: { gte: createdAfter, lt: createdBefore },
      });
    });

    it('applies only the lower bound (inclusive) when only createdAfter is given', async () => {
      const createdAfter = new Date('2026-11-01T00:00:00.000Z');

      await repository.findAll({ createdAfter }, 0, 20);

      expect(args().where).toEqual({ createdAt: { gte: createdAfter, lt: undefined } });
    });

    it('applies only the upper bound (exclusive) when only createdBefore is given', async () => {
      const createdBefore = new Date('2026-11-08T00:00:00.000Z');

      await repository.findAll({ createdBefore }, 0, 20);

      const where = args().where;
      expect(where).toEqual({ createdAt: { lt: createdBefore } });
      expect(where?.createdAt).toHaveProperty('lt', createdBefore);
      expect(where?.createdAt).not.toHaveProperty('gte', expect.any(Date));
    });
  });

  describe('count', () => {
    it('uses the same where as the list', async () => {
      prisma.activityLog.count.mockResolvedValue(7);

      await expect(repository.count({ entity: 'Deal', entityId: 7 })).resolves.toBe(7);
      expect(prisma.activityLog.count).toHaveBeenCalledWith({
        where: { entity: 'Deal', entityId: 7 },
      });
    });
  });
});
