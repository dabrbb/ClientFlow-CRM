import { Prisma, Role } from '@prisma/client';

import type { ActivityWithUser } from '../activity.repository';

export class ActivityResponseDto {
  id: number;
  action: string;
  entity: string;
  entityId: number;
  details: Prisma.JsonValue;
  createdAt: Date;

  user: {
    id: number;
    name: string;
    email: string;
    role: Role;
  };

  constructor(entry: ActivityWithUser) {
    this.id = entry.id;
    this.action = entry.action;
    this.entity = entry.entity;
    this.entityId = entry.entityId;
    this.details = entry.details;
    this.createdAt = entry.createdAt;
    this.user = entry.user;
  }
}

export class ActivityListResponseDto {
  readonly data: ActivityResponseDto[];
  readonly meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };

  constructor(entries: ActivityWithUser[], page: number, limit: number, total: number) {
    this.data = entries.map((entry) => new ActivityResponseDto(entry));
    this.meta = { page, limit, total, pages: Math.ceil(total / limit) };
  }
}
