import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

import type { ActivityRecord } from './activity.types';

export type ActivityWithUser = Prisma.ActivityLogGetPayload<{
  include: { user: { select: { id: true; name: true; email: true; role: true } } };
}>;

export interface ActivityFilters {
  entity?: string;
  entityId?: number;
  action?: string;
  userId?: number;
  // createdAt >= createdAfter
  createdAfter?: Date;
  // createdAt < createdBefore, so consecutive ranges never overlap
  createdBefore?: Date;
}

const userSelect = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

// The log is append-only: this repository deliberately has no update and no delete.
@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere({
    entity,
    entityId,
    action,
    userId,
    createdAfter,
    createdBefore,
  }: ActivityFilters): Prisma.ActivityLogWhereInput {
    const where: Prisma.ActivityLogWhereInput = {};

    if (entity !== undefined) where.entity = entity;
    if (entityId !== undefined) where.entityId = entityId;
    if (action !== undefined) where.action = action;
    if (userId !== undefined) where.userId = userId;

    if (createdAfter !== undefined || createdBefore !== undefined) {
      where.createdAt = { gte: createdAfter, lt: createdBefore };
    }

    return where;
  }

  // One INSERT statement, so the records of a request are stored together or not at all.
  async createMany(userId: number, records: ActivityRecord[]): Promise<void> {
    await this.prisma.activityLog.createMany({
      data: records.map((record) => ({
        userId,
        action: record.action,
        entity: record.entity,
        entityId: record.entityId,
        details: record.details,
      })),
    });
  }

  // Newest first; id only keeps the order of equal timestamps stable between pages and does not
  // say which of two simultaneous records happened first.
  async findAll(filters: ActivityFilters, skip: number, take: number): Promise<ActivityWithUser[]> {
    return this.prisma.activityLog.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      include: { user: { select: userSelect } },
    });
  }

  async count(filters: ActivityFilters): Promise<number> {
    return this.prisma.activityLog.count({ where: this.buildWhere(filters) });
  }
}
