import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Task, TaskStatus } from '@prisma/client';

import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { managerScope } from 'src/common/access/manager-scope';
import { ClientsService } from 'src/clients/clients.service';
import { UsersService } from 'src/users/users.service';
import { DealsService } from 'src/deals/deals.service';
import type { DealResponseDto } from 'src/deals/dto/deal-response.dto';

import { TaskFilters, TasksRepository } from './tasks.repository';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly usersService: UsersService,
    private readonly dealsService: DealsService,
    private readonly clientsService: ClientsService,
  ) {}

  // Who a task may be given to:
  // - a task with a deal only to someone assigned to that deal's client, so the assignee can
  //   always see it;
  // - a task without a deal only to the actor themselves, unless the actor is an admin.
  private async checkAssignee(
    assigneeId: number,
    deal: DealResponseDto | null,
    actor: JwtPayload,
  ): Promise<void> {
    await this.usersService.getUserById(assigneeId);

    if (deal) {
      if (!(await this.clientsService.isAssigned(deal.client.id, assigneeId))) {
        throw new BadRequestException("The assignee is not assigned to this deal's client");
      }
      return;
    }

    if (actor.role !== Role.ADMIN && assigneeId !== actor.sub) {
      throw new ForbiddenException('A task without a deal can only be assigned to yourself');
    }
  }

  async createTask(dto: CreateTaskDto, actor: JwtPayload): Promise<Task> {
    const deal =
      dto.dealId !== undefined ? await this.dealsService.getDealForActor(dto.dealId, actor) : null;

    await this.checkAssignee(dto.assigneeId, deal, actor);

    const data: Prisma.TaskCreateInput = {
      title: dto.title,
      description: dto.description,
      status: dto.status,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignee: { connect: { id: dto.assigneeId } },
      ...(dto.dealId !== undefined && {
        deal: { connect: { id: dto.dealId } },
      }),
    };

    return this.tasksRepository.create(data);
  }

  // A task the actor may not see is reported as missing, so its existence is not revealed.
  async getTaskById(id: number, actor: JwtPayload): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findById(id, managerScope(actor));

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return new TaskResponseDto(task);
  }

  async getAllTasks(
    actor: JwtPayload,
    filters: Pick<TaskFilters, 'assigneeId'> = {},
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksRepository.findAll({
      ...filters,
      visibleTo: managerScope(actor),
    });

    return tasks.map((task) => new TaskResponseDto(task));
  }

  // The actor's own unfinished tasks (TODO, IN_PROGRESS) due in [from, before), among the tasks
  // they may see. Used for the dashboard.
  async countOpenDueTasks(actor: JwtPayload, from: Date, before: Date): Promise<number> {
    return this.tasksRepository.count({
      assigneeId: actor.sub,
      visibleTo: managerScope(actor),
      statuses: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
      dueFrom: from,
      dueBefore: before,
    });
  }

  async updateTask(id: number, dto: UpdateTaskDto, actor: JwtPayload): Promise<TaskResponseDto> {
    const current = await this.getTaskById(id, actor);

    if (dto.assigneeId !== undefined) {
      const deal = current.deal
        ? await this.dealsService.getDealForActor(current.deal.id, actor)
        : null;

      await this.checkAssignee(dto.assigneeId, deal, actor);
    }

    const { assigneeId, dueDate, ...rest } = dto;

    const data: Prisma.TaskUpdateInput = {
      ...rest,
      ...(dueDate !== undefined && {
        dueDate: dueDate === null ? null : new Date(dueDate),
      }),
      ...(assigneeId !== undefined && {
        assignee: { connect: { id: assigneeId } },
      }),
    };

    const updatedTask = await this.tasksRepository.update(id, data);

    // Re-read without the visibility filter: the update may have handed the task to someone else.
    const task = await this.tasksRepository.findById(updatedTask.id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return new TaskResponseDto(task);
  }

  async updateTaskStatus(
    id: number,
    status: TaskStatus,
    actor: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.updateTask(id, { status }, actor);
  }
}
