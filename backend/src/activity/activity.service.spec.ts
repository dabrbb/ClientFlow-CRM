import { Role } from '@prisma/client';
import { ActivityRepository, ActivityWithUser } from './activity.repository';
import { ActivityService } from './activity.service';
import { GetActivityQueryDto } from './dto/get-activity-query.dto';

describe('ActivityService', () => {
  const repository = {
    createMany: jest.fn<Promise<void>, Parameters<ActivityRepository['createMany']>>(),
    findAll: jest.fn<Promise<ActivityWithUser[]>, Parameters<ActivityRepository['findAll']>>(),
    count: jest.fn<Promise<number>, Parameters<ActivityRepository['count']>>(),
  };

  let service: ActivityService;

  const entry: ActivityWithUser = {
    id: 1,
    action: 'CLAIM',
    entity: 'Client',
    entityId: 5,
    details: null,
    createdAt: new Date(0),
    userId: 2,
    user: { id: 2, name: 'M', email: 'm@example.com', role: Role.MANAGER },
  };

  const makeQuery = (overrides: Partial<GetActivityQueryDto> = {}): GetActivityQueryDto =>
    Object.assign(new GetActivityQueryDto(), overrides);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.createMany.mockResolvedValue(undefined);
    repository.findAll.mockResolvedValue([entry]);
    repository.count.mockResolvedValue(45);
    service = new ActivityService(repository as unknown as ActivityRepository);
  });

  describe('record', () => {
    it('stores the records for the user', async () => {
      const records = [{ action: 'CLAIM' as const, entity: 'Client' as const, entityId: 5 }];

      await service.record(2, records);

      expect(repository.createMany).toHaveBeenCalledWith(2, records);
    });

    it('does not touch the database for an empty list', async () => {
      await service.record(2, []);

      expect(repository.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getActivity', () => {
    it('computes skip and take from page and limit and reports the meta', async () => {
      const result = await service.getActivity(makeQuery({ page: 3, limit: 20 }));

      expect(repository.findAll).toHaveBeenCalledWith(expect.anything(), 40, 20);
      expect(result.meta).toEqual({ page: 3, limit: 20, total: 45, pages: 3 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].user).toEqual(entry.user);
    });

    it('passes the same filters to the list and to the count', async () => {
      await service.getActivity(
        makeQuery({ entity: 'Task', entityId: 4, action: 'ASSIGN', userId: 2 }),
      );

      const expected = {
        entity: 'Task',
        entityId: 4,
        action: 'ASSIGN',
        userId: 2,
        createdAfter: undefined,
        createdBefore: undefined,
      };
      expect(repository.findAll.mock.calls[0][0]).toEqual(expected);
      expect(repository.count.mock.calls[0][0]).toEqual(expected);
    });

    it('turns the date strings into Dates, a plain date meaning UTC midnight', async () => {
      await service.getActivity(
        makeQuery({ createdAfter: '2026-11-01', createdBefore: '2026-11-08T10:00:00+03:00' }),
      );

      const filters = repository.count.mock.calls[0][0];
      expect(filters.createdAfter?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(filters.createdBefore?.toISOString()).toBe('2026-11-08T07:00:00.000Z');
    });
  });
});
