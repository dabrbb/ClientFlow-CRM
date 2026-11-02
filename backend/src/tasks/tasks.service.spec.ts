import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role, Task, TaskStatus } from '@prisma/client';
import { DealsService } from 'src/deals/deals.service';
import { UsersService } from 'src/users/users.service';
import { TaskResponseDto } from './dto/task-response.dto';
import { TasksRepository, TaskWithRelations } from './tasks.repository';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;

  const tasksRepository = {
    findById: jest.fn<Promise<TaskWithRelations | null>, [number]>(),
    update: jest.fn<Promise<Task>, [number, Prisma.TaskUpdateInput]>(),
  };

  const makeTask = (overrides: Partial<TaskWithRelations> = {}): TaskWithRelations => ({
    id: 5,
    title: 'Call the client',
    description: null,
    status: TaskStatus.TODO,
    dueDate: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    assigneeId: 2,
    dealId: null,
    assignee: { id: 2, name: 'Manager', email: 'manager@example.com', role: Role.MANAGER },
    deal: null,
    ...overrides,
  });

  // updateTask reads the task twice: once to check it exists, once after the update.
  const givenTask = (before: TaskWithRelations, after: TaskWithRelations = before) => {
    tasksRepository.findById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    tasksRepository.update.mockResolvedValue(after);
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TasksRepository, useValue: tasksRepository },
        { provide: UsersService, useValue: {} },
        { provide: DealsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(TasksService);
  });

  describe('updateTask', () => {
    it('sends only the given fields to the repository', async () => {
      givenTask(makeTask(), makeTask({ title: 'New title' }));

      await service.updateTask(5, { title: 'New title' });

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { title: 'New title' }]);
    });

    it('turns a dueDate string into a Date and keeps null as null', async () => {
      givenTask(makeTask());
      await service.updateTask(5, { dueDate: '2026-11-02T10:00:00Z' });

      givenTask(makeTask());
      await service.updateTask(5, { dueDate: null });

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([
        5,
        { dueDate: new Date('2026-11-02T10:00:00Z') },
      ]);
      expect(tasksRepository.update.mock.calls[1]).toStrictEqual([5, { dueDate: null }]);
    });

    it('returns the task re-read after the update as a TaskResponseDto', async () => {
      givenTask(makeTask(), makeTask({ title: 'New title' }));

      const result = await service.updateTask(5, { title: 'New title' });

      expect(result).toBeInstanceOf(TaskResponseDto);
      expect(result.title).toBe('New title');
    });

    it('throws NotFoundException for a missing task and updates nothing', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.updateTask(999, { title: 'New title' })).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('updateTaskStatus', () => {
    const statuses = Object.values(TaskStatus);
    const transitions = statuses.flatMap((from) =>
      statuses.map((to): [TaskStatus, TaskStatus] => [from, to]),
    );

    it('sends only the status to the repository', async () => {
      givenTask(makeTask(), makeTask({ status: TaskStatus.DONE }));

      await service.updateTaskStatus(5, TaskStatus.DONE);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { status: TaskStatus.DONE }]);
    });

    it('returns the updated task as a TaskResponseDto with the new status', async () => {
      givenTask(makeTask(), makeTask({ status: TaskStatus.IN_PROGRESS }));

      const result = await service.updateTaskStatus(5, TaskStatus.IN_PROGRESS);

      expect(result).toBeInstanceOf(TaskResponseDto);
      expect(result.id).toBe(5);
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('throws NotFoundException for a missing task and updates nothing', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.updateTaskStatus(999, TaskStatus.DONE)).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    // There are no transition rules yet: any status may follow any other, including itself.
    it.each(transitions)('allows %s -> %s', async (from, to) => {
      givenTask(makeTask({ status: from }), makeTask({ status: to }));

      const result = await service.updateTaskStatus(5, to);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { status: to }]);
      expect(result.status).toBe(to);
    });
  });
});
