import { Injectable } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

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

  async findAll(): Promise<Client[]> {
    return this.prisma.client.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(id: number, data: Prisma.ClientUpdateInput): Promise<Client> {
    return this.prisma.client.update({
      where: { id },
      data,
    });
  }
}
