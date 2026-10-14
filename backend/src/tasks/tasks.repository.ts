import { Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

export type TaskWithRelations = Prisma.TaskGetPayload<{
  include: {
    assignee: {
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
      };
    };
    deal: {
      select: {
        id: true;
        title: true;
        stage: true;
        value: true;
      };
    };
  };
}>;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return this.prisma.task.create({
      data,
    });
  }

  async findById(id: number): Promise<TaskWithRelations | null> {
    return this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        deal: {
          select: {
            id: true,
            title: true,
            stage: true,
            value: true,
          },
        },
      },
    });
  }

  async findAll(): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        deal: {
          select: {
            id: true,
            title: true,
            stage: true,
            value: true,
          },
        },
      },
    });
  }

  async update(id: number, data: Prisma.TaskUpdateInput): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data,
    });
  }
}
