import { Injectable } from '@nestjs/common';
import { DealStage, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type DealWithClient = Prisma.DealGetPayload<{
  include: {
    client: true;
  };
}>;

export interface DealStageStats {
  stage: DealStage;
  count: number;
  valueSum: number;
}

export interface DealFilters {
  // Only deals of clients this user is assigned to. Left undefined, nothing is restricted.
  managerId?: number;
}

@Injectable()
export class DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private assignedTo(managerId: number): Prisma.DealWhereInput {
    return { client: { managers: { some: { userId: managerId } } } };
  }

  private buildWhere({ managerId }: DealFilters): Prisma.DealWhereInput {
    return managerId === undefined ? {} : this.assignedTo(managerId);
  }

  async create(data: Prisma.DealCreateInput): Promise<DealWithClient> {
    return this.prisma.deal.create({
      data,

      include: {
        client: true,
      },
    });
  }

  async findById(id: number, managerId?: number): Promise<DealWithClient | null> {
    return this.prisma.deal.findFirst({
      where: { id, ...this.buildWhere({ managerId }) },

      include: {
        client: true,
      },
    });
  }

  async findAll(filters: DealFilters = {}): Promise<DealWithClient[]> {
    return this.prisma.deal.findMany({
      where: this.buildWhere(filters),
      include: {
        client: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // One grouped query: the number of deals and the sum of their values for every stage that has
  // at least one deal. Deals without a value add nothing to the sum.
  async statsByStage(filters: DealFilters = {}): Promise<DealStageStats[]> {
    const groups = await this.prisma.deal.groupBy({
      by: ['stage'],
      where: this.buildWhere(filters),
      _count: { _all: true },
      _sum: { value: true },
    });

    return groups.map((group) => ({
      stage: group.stage,
      count: group._count._all,
      valueSum: group._sum.value ?? 0,
    }));
  }

  async update(id: number, data: Prisma.DealUpdateInput): Promise<DealWithClient> {
    return this.prisma.deal.update({
      where: { id },
      data,
      include: {
        client: true,
      },
    });
  }
}
