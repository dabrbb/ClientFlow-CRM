import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';

import { UsersService } from 'src/users/users.service';
import { DealsService } from 'src/deals/deals.service';

import { TasksRepository } from './tasks.repository';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly usersService: UsersService,
    private readonly dealsService: DealsService,
  ) {}

  async createTask(dto: CreateTaskDto): Promise<Task> {
    await this.usersService.getUserById(dto.assigneeId);

    if (dto.dealId !== undefined) {
      await this.dealsService.getDealById(dto.dealId);
    }

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

  async getTaskById(id: number): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findById(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return new TaskResponseDto(task);
  }

  async getAllTasks(): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksRepository.findAll();

    return tasks.map((task) => new TaskResponseDto(task));
  }

  async updateTask(id: number, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    await this.getTaskById(id);

    const data: Prisma.TaskUpdateInput = {
      ...dto,
      ...(dto.dueDate !== undefined && {
        dueDate: dto.dueDate === null ? null : new Date(dto.dueDate),
      }),
    };

    const updatedTask = await this.tasksRepository.update(id, data);

    const task = await this.tasksRepository.findById(updatedTask.id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return new TaskResponseDto(task);
  }
}
