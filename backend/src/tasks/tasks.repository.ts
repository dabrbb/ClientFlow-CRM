import { Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

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

export interface TaskFilters {
  assigneeId?: number;
}

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere({ assigneeId }: TaskFilters): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (assigneeId !== undefined) {
      where.assigneeId = assigneeId;
    }

    return where;
  }

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

  async findAll(filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: this.buildWhere(filters),
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
