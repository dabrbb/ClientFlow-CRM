import { Injectable } from '@nestjs/common';
import { Deal, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

export type DealWithClient = Prisma.DealGetPayload<{
  include: {
    client: true;
  };
}>;

@Injectable()
export class DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DealCreateInput): Promise<DealWithClient> {
    return this.prisma.deal.create({
      data,

      include: {
        client: true,
      },
    });
  }

  async findById(id: number): Promise<DealWithClient | null> {
    return this.prisma.deal.findUnique({
      where: { id },

      include: {
        client: true,
      },
    });
  }

  async findAll(): Promise<DealWithClient[]> {
    return this.prisma.deal.findMany({
      include: {
        client: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
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
