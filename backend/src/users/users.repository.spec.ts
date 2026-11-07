import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { Colleague, UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  let repository: UsersRepository;

  const prisma = {
    user: {
      findMany: jest.fn<Promise<Colleague[]>, [Prisma.UserFindManyArgs]>(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [UsersRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(UsersRepository);
  });

  describe('findAllColleagues', () => {
    it('selects only id, name and role, so secrets are never read from the database', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await repository.findAllColleagues();

      expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({
        id: true,
        name: true,
        role: true,
      });
    });

    it('orders by name, A to Z, and applies no filter', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await repository.findAllColleagues();

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ name: 'asc' });
      expect(args.where).toBeUndefined();
    });

    it('returns what the database returns', async () => {
      const rows: Colleague[] = [{ id: 1, name: 'Alice', role: 'ADMIN' }];
      prisma.user.findMany.mockResolvedValue(rows);

      await expect(repository.findAllColleagues()).resolves.toBe(rows);
    });
  });
});
