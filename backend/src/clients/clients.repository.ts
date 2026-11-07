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
}
