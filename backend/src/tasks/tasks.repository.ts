import { Injectable } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
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
  // Only tasks this user may see. Left undefined, nothing is restricted.
  visibleTo?: number;
  statuses?: TaskStatus[];
  // Half-open range on dueDate: dueFrom <= dueDate < dueBefore. A task without a due date never
  // matches when either bound is set.
  dueFrom?: Date;
  dueBefore?: Date;
}

const relations = {
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
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  // A task with a deal belongs to the deal's client and is seen by everyone assigned to that
  // client. A task without a deal belongs to nobody's client, so only its assignee sees it.
  private visibleTo(userId: number): Prisma.TaskWhereInput[] {
    return [
      { deal: { client: { managers: { some: { userId } } } } },
      { dealId: null, assigneeId: userId },
    ];
  }

  private buildWhere({
    assigneeId,
    visibleTo,
    statuses,
    dueFrom,
    dueBefore,
  }: TaskFilters): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (assigneeId !== undefined) {
      where.assigneeId = assigneeId;
    }

    if (statuses !== undefined) {
      where.status = { in: statuses };
    }

    if (dueFrom !== undefined || dueBefore !== undefined) {
      where.dueDate = { gte: dueFrom, lt: dueBefore };
    }

    if (visibleTo !== undefined) {
      where.OR = this.visibleTo(visibleTo);
    }

    return where;
  }

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return this.prisma.task.create({
      data,
    });
  }

  async findById(id: number, visibleTo?: number): Promise<TaskWithRelations | null> {
    return this.prisma.task.findFirst({
      where: { id, ...this.buildWhere({ visibleTo }) },
      include: relations,
    });
  }

  async findAll(filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      include: relations,
    });
  }

  async count(filters: TaskFilters = {}): Promise<number> {
    return this.prisma.task.count({ where: this.buildWhere(filters) });
  }

  async update(id: number, data: Prisma.TaskUpdateInput): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data,
    });
  }
}
