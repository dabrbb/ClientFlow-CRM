import { DealStage, Role, TaskStatus } from '@prisma/client';

import { TaskWithRelations } from '../tasks.repository';

export class TaskResponseDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;

  assignee: {
    id: number;
    name: string;
    email: string;
    role: Role;
  };

  deal: {
    id: number;
    title: string;
    stage: DealStage;
    value: number | null;
  } | null;

  constructor(task: TaskWithRelations) {
    this.id = task.id;
    this.title = task.title;
    this.description = task.description;
    this.status = task.status;
    this.dueDate = task.dueDate;
    this.createdAt = task.createdAt;
    this.updatedAt = task.updatedAt;

    this.assignee = task.assignee;

    this.deal = task.deal;
  }
}
