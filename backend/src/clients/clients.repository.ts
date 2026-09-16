import { Injectable } from '@nestjs/common';
import { Client, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

interface FindAllClientsParams {
  skip: number;
  take: number;
  search?: string;
  status?: ClientStatus;
  sort: 'name' | 'createdAt';
  order: 'asc' | 'desc';
}

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ClientCreateInput): Promise<Client> {
    return this.prisma.client.create({
      data,
    });
  }

  async findById(id: number): Promise<Client | null> {
    return this.prisma.client.findUnique({
      where: { id },
    });
  }

  async findAll(params: FindAllClientsParams): Promise<Client[]> {
    const { skip, take, search, status, sort, order } = params;

    const where: Prisma.ClientWhereInput = {};

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

    return this.prisma.client.findMany({
      where,
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

  async count(search?: string, status?: ClientStatus): Promise<number> {
    const where: Prisma.ClientWhereInput = {};

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

    return this.prisma.client.count({
      where,
    });
  }
}
