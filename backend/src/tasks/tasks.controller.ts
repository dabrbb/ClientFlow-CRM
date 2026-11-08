import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { LogActivity } from 'src/activity/log-activity.decorator';
import { taskCreated, taskStatusChanged, taskUpdated } from 'src/activity/activity-mappers';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @LogActivity(taskCreated)
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.createTask(dto, user);
  }

  @Get()
  async findAll(@Query() query: GetTasksQueryDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.getAllTasks(user, { assigneeId: query.mine ? user.sub : undefined });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.tasksService.getTaskById(id, user);
  }

  @Patch(':id')
  @LogActivity(taskUpdated)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.updateTask(id, dto, user);
  }

  @Patch(':id/status')
  @LogActivity(taskStatusChanged)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.updateTaskStatus(id, dto.status, user);
  }
}
