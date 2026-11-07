import { Injectable } from '@nestjs/common';
import { Client, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

interface ClientFilters {
  search?: string;
  status?: ClientStatus;
  createdAfter?: Date;
  // Only clients this user is assigned to. Left undefined, nothing is restricted.
  managerId?: number;
}

interface FindAllClientsParams extends ClientFilters {
  skip: number;
  take: number;
  sort: 'name' | 'createdAt';
  order: 'asc' | 'desc';
}

export type PoolClient = Prisma.ClientGetPayload<{
  select: { id: true; name: true; status: true; createdAt: true };
}>;

const managerWithUser = {
  user: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ClientManagerInclude;

export type ClientManagerWithUser = Prisma.ClientManagerGetPayload<{
  include: typeof managerWithUser;
}>;

export type ClaimResult = 'claimed' | 'taken' | 'not_found';

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private assignedTo(managerId: number): Prisma.ClientManagerListRelationFilter {
    return { some: { userId: managerId } };
  }

  private buildWhere({
    search,
    status,
    createdAfter,
    managerId,
  }: ClientFilters): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {};

    if (managerId !== undefined) {
      where.managers = this.assignedTo(managerId);
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (createdAfter) {
      where.createdAt = { gte: createdAfter };
    }

    return where;
  }

  async create(data: Prisma.ClientCreateInput): Promise<Client> {
    return this.prisma.client.create({
      data,
    });
  }

  async findById(id: number, managerId?: number): Promise<Client | null> {
    return this.prisma.client.findFirst({
      where: {
        id,
        ...(managerId !== undefined && { managers: this.assignedTo(managerId) }),
      },
    });
  }

  async findAll(params: FindAllClientsParams): Promise<Client[]> {
    const { skip, take, sort, order, ...filters } = params;

    return this.prisma.client.findMany({
      where: this.buildWhere(filters),
      skip,
      take,
      orderBy: {
        [sort]: order,
      },
    });
  }

  async update(id: number, data: Prisma.ClientUpdateInput): Promise<Client> {
    return this.prisma.client.update({
      where: { id },
      data,
    });
  }

  async count(filters: ClientFilters): Promise<number> {
    return this.prisma.client.count({
      where: this.buildWhere(filters),
    });
  }

  // The pool is every client with no manager; it is derived, never stored.
  private readonly poolWhere: Prisma.ClientWhereInput = { managers: { none: {} } };

  async findPool(params: { skip: number; take: number }): Promise<PoolClient[]> {
    return this.prisma.client.findMany({
      where: this.poolWhere,
      select: { id: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async countPool(): Promise<number> {
    return this.prisma.client.count({ where: this.poolWhere });
  }

  // Taking a client must be atomic: the primary key (clientId, userId) does not stop two
  // different managers from both being inserted. The row lock makes concurrent claims queue up,
  // so the second one sees the first one's manager and reports 'taken'.
  async claim(clientId: number, userId: number): Promise<ClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE
      `;

      if (locked.length === 0) {
        return 'not_found';
      }

      const managers = await tx.clientManager.count({ where: { clientId } });

      if (managers > 0) {
        return 'taken';
      }

      await tx.clientManager.create({ data: { clientId, userId, assignedById: userId } });

      return 'claimed';
    });
  }

  async findManagers(clientId: number): Promise<ClientManagerWithUser[]> {
    return this.prisma.clientManager.findMany({
      where: { clientId },
      include: managerWithUser,
      orderBy: { assignedAt: 'asc' },
    });
  }

  // Returns null when the user is already assigned (skipDuplicates makes that a no-op).
  async addManager(
    clientId: number,
    userId: number,
    assignedById: number,
  ): Promise<ClientManagerWithUser | null> {
    const { count } = await this.prisma.clientManager.createMany({
      data: [{ clientId, userId, assignedById }],
      skipDuplicates: true,
    });

    if (count === 0) {
      return null;
    }

    return this.prisma.clientManager.findUniqueOrThrow({
      where: { clientId_userId: { clientId, userId } },
      include: managerWithUser,
    });
  }

  // Returns false when the user was not assigned. Removing the last manager puts the client back
  // into the pool by itself.
  async removeManager(clientId: number, userId: number): Promise<boolean> {
    const { count } = await this.prisma.clientManager.deleteMany({
      where: { clientId, userId },
    });

    return count > 0;
  }
}
