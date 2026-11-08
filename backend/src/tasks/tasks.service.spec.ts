import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, Role, Task, TaskStatus } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsService } from 'src/clients/clients.service';
import { DealsService } from 'src/deals/deals.service';
import type { DealResponseDto } from 'src/deals/dto/deal-response.dto';
import { UsersService } from 'src/users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { TasksRepository, TaskWithRelations } from './tasks.repository';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;

  const manager: JwtPayload = { sub: 7, email: 'manager@example.com', role: Role.MANAGER };
  const admin: JwtPayload = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };

  const tasksRepository = {
    create: jest.fn<Promise<Task>, [Prisma.TaskCreateInput]>(),
    findById: jest.fn<Promise<TaskWithRelations | null>, [number, number?]>(),
    update: jest.fn<Promise<Task>, [number, Prisma.TaskUpdateInput]>(),
    findAll: jest.fn<
      ReturnType<TasksRepository['findAll']>,
      Parameters<TasksRepository['findAll']>
    >(),
    count: jest.fn<ReturnType<TasksRepository['count']>, Parameters<TasksRepository['count']>>(),
  };

  const usersService = {
    getUserById: jest.fn<Promise<unknown>, [number]>(),
  };

  const dealsService = {
    getDealForActor: jest.fn<
      ReturnType<DealsService['getDealForActor']>,
      Parameters<DealsService['getDealForActor']>
    >(),
  };

  const clientsService = {
    isAssigned: jest.fn<Promise<boolean>, [number, number]>(),
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

  const withDeal = (overrides: Partial<TaskWithRelations> = {}): TaskWithRelations =>
    makeTask({
      dealId: 9,
      deal: { id: 9, title: 'Big deal', stage: 'NEW', value: 100 },
      ...overrides,
    });

  // A deal of client 3, as the access-checked lookup returns it.
  const aDeal = { id: 9, client: { id: 3 } } as DealResponseDto;

  const createDto = (overrides: Partial<CreateTaskDto> = {}): CreateTaskDto =>
    Object.assign(new CreateTaskDto(), { title: 'Call the client', assigneeId: 7 }, overrides);

  const createdData = () => tasksRepository.create.mock.calls[0][0];

  // updateTask reads the task twice: once to check access, once after the update.
  const givenTask = (before: TaskWithRelations, after: TaskWithRelations = before) => {
    tasksRepository.findById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    tasksRepository.update.mockResolvedValue(after);
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    usersService.getUserById.mockResolvedValue({});
    dealsService.getDealForActor.mockResolvedValue(aDeal);
    clientsService.isAssigned.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TasksRepository, useValue: tasksRepository },
        { provide: UsersService, useValue: usersService },
        { provide: DealsService, useValue: dealsService },
        { provide: ClientsService, useValue: clientsService },
      ],
    }).compile();

    service = moduleRef.get(TasksService);
  });

  describe('getAllTasks', () => {
    it('maps every task to a TaskResponseDto, keeping the order', async () => {
      tasksRepository.findAll.mockResolvedValue([makeTask({ id: 2 }), makeTask({ id: 1 })]);

      const result = await service.getAllTasks(admin);

      expect(result.map((task) => task.id)).toEqual([2, 1]);
      result.forEach((task) => expect(task).toBeInstanceOf(TaskResponseDto));
    });

    it('limits a manager to the tasks they may see', async () => {
      tasksRepository.findAll.mockResolvedValue([]);

      await service.getAllTasks(manager);

      expect(tasksRepository.findAll).toHaveBeenCalledWith({ visibleTo: manager.sub });
    });

    it('does not limit an admin', async () => {
      tasksRepository.findAll.mockResolvedValue([]);

      await service.getAllTasks(admin);

      expect(tasksRepository.findAll).toHaveBeenCalledWith({ visibleTo: undefined });
    });

    it('keeps the assignee filter next to the visibility limit', async () => {
      tasksRepository.findAll.mockResolvedValue([makeTask({ assigneeId: 7 })]);

      const result = await service.getAllTasks(manager, { assigneeId: 7 });

      expect(tasksRepository.findAll).toHaveBeenCalledWith({ assigneeId: 7, visibleTo: 7 });
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(TaskResponseDto);
    });

    it('returns an empty list when there are no tasks', async () => {
      tasksRepository.findAll.mockResolvedValue([]);

      await expect(service.getAllTasks(manager)).resolves.toEqual([]);
    });
  });

  describe('getTaskById', () => {
    it('looks a task up for a manager only among the tasks they may see', async () => {
      tasksRepository.findById.mockResolvedValue(makeTask());

      const result = await service.getTaskById(5, manager);

      expect(tasksRepository.findById).toHaveBeenCalledWith(5, manager.sub);
      expect(result).toBeInstanceOf(TaskResponseDto);
    });

    it('looks a task up for an admin among all tasks', async () => {
      tasksRepository.findById.mockResolvedValue(makeTask());

      await service.getTaskById(5, admin);

      expect(tasksRepository.findById).toHaveBeenCalledWith(5, undefined);
    });

    it('reports a task the actor cannot see as not found', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.getTaskById(5, manager)).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
    });
  });

  describe('createTask with a deal', () => {
    it('checks the actor may see the deal and creates nothing if not', async () => {
      dealsService.getDealForActor.mockRejectedValue(new NotFoundException('Deal not found'));

      await expect(service.createTask(createDto({ dealId: 9 }), manager)).rejects.toThrow(
        NotFoundException,
      );
      expect(dealsService.getDealForActor).toHaveBeenCalledWith(9, manager);
      expect(usersService.getUserById).not.toHaveBeenCalled();
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('creates the task for an assignee who is assigned to the deal client', async () => {
      tasksRepository.create.mockResolvedValue({} as Task);

      await service.createTask(createDto({ dealId: 9, assigneeId: 8 }), manager);

      expect(clientsService.isAssigned).toHaveBeenCalledWith(3, 8);
      expect(createdData()).toMatchObject({
        title: 'Call the client',
        assignee: { connect: { id: 8 } },
        deal: { connect: { id: 9 } },
      });
    });

    it('answers 400 and creates nothing when the assignee is not assigned to that client', async () => {
      clientsService.isAssigned.mockResolvedValue(false);

      await expect(
        service.createTask(createDto({ dealId: 9, assigneeId: 8 }), manager),
      ).rejects.toThrow(BadRequestException);
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('holds an admin assignee to the same rule', async () => {
      clientsService.isAssigned.mockResolvedValue(false);

      await expect(
        service.createTask(createDto({ dealId: 9, assigneeId: admin.sub }), manager),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 404 for an assignee that does not exist', async () => {
      usersService.getUserById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(
        service.createTask(createDto({ dealId: 9, assigneeId: 999 }), manager),
      ).rejects.toThrow(NotFoundException);
      expect(clientsService.isAssigned).not.toHaveBeenCalled();
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('lets an admin create a task for a client they are not assigned to, for an assigned manager', async () => {
      tasksRepository.create.mockResolvedValue({} as Task);

      await service.createTask(createDto({ dealId: 9, assigneeId: 8 }), admin);

      expect(dealsService.getDealForActor).toHaveBeenCalledWith(9, admin);
      expect(tasksRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createTask without a deal', () => {
    it('lets a manager create a task for themselves', async () => {
      tasksRepository.create.mockResolvedValue({} as Task);

      await service.createTask(createDto({ assigneeId: manager.sub }), manager);

      expect(dealsService.getDealForActor).not.toHaveBeenCalled();
      expect(clientsService.isAssigned).not.toHaveBeenCalled();
      expect(createdData()).toMatchObject({ assignee: { connect: { id: manager.sub } } });
      expect(createdData()).not.toHaveProperty('deal');
    });

    it('forbids a manager to create one for a colleague', async () => {
      await expect(service.createTask(createDto({ assigneeId: 8 }), manager)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tasksRepository.create).not.toHaveBeenCalled();
    });

    it('lets an admin create one for anybody who exists', async () => {
      tasksRepository.create.mockResolvedValue({} as Task);

      await service.createTask(createDto({ assigneeId: 8 }), admin);

      expect(usersService.getUserById).toHaveBeenCalledWith(8);
      expect(tasksRepository.create).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for an assignee that does not exist, even for an admin', async () => {
      usersService.getUserById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(service.createTask(createDto({ assigneeId: 999 }), admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTask fields', () => {
    it('turns a dueDate string into a Date and sends nothing for a missing one', async () => {
      tasksRepository.create.mockResolvedValue({} as Task);

      await service.createTask(createDto({ dueDate: '2026-11-02T10:00:00Z' }), manager);
      await service.createTask(createDto(), manager);

      expect(tasksRepository.create.mock.calls[0][0].dueDate).toEqual(
        new Date('2026-11-02T10:00:00Z'),
      );
      expect(tasksRepository.create.mock.calls[1][0].dueDate).toBeUndefined();
    });
  });

  describe('updateTask', () => {
    it('sends only the given fields to the repository', async () => {
      givenTask(makeTask(), makeTask({ title: 'New title' }));

      await service.updateTask(5, { title: 'New title' }, manager);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { title: 'New title' }]);
    });

    it('turns a dueDate string into a Date and keeps null as null', async () => {
      givenTask(makeTask());
      await service.updateTask(5, { dueDate: '2026-11-02T10:00:00Z' }, manager);

      givenTask(makeTask());
      await service.updateTask(5, { dueDate: null }, manager);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([
        5,
        { dueDate: new Date('2026-11-02T10:00:00Z') },
      ]);
      expect(tasksRepository.update.mock.calls[1]).toStrictEqual([5, { dueDate: null }]);
    });

    it('returns the task re-read after the update as a TaskResponseDto', async () => {
      givenTask(makeTask(), makeTask({ title: 'New title' }));

      const result = await service.updateTask(5, { title: 'New title' }, manager);

      expect(result).toBeInstanceOf(TaskResponseDto);
      expect(result.title).toBe('New title');
    });

    it('checks access with the actor, then re-reads without any visibility limit', async () => {
      givenTask(makeTask());

      await service.updateTask(5, { title: 'New title' }, manager);

      expect(tasksRepository.findById.mock.calls[0]).toEqual([5, manager.sub]);
      expect(tasksRepository.findById.mock.calls[1]).toEqual([5]);
    });

    it('throws NotFoundException for a task the actor cannot see and updates nothing', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.updateTask(999, { title: 'New title' }, manager)).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    it('does not look up users, deals or clients when the assignee is not changed', async () => {
      givenTask(withDeal());

      await service.updateTask(5, { title: 'New title' }, manager);

      expect(usersService.getUserById).not.toHaveBeenCalled();
      expect(dealsService.getDealForActor).not.toHaveBeenCalled();
      expect(clientsService.isAssigned).not.toHaveBeenCalled();
    });
  });

  describe('updateTask: handing a task to another assignee', () => {
    it('moves a task with a deal to a colleague assigned to the same client', async () => {
      givenTask(withDeal(), withDeal({ assigneeId: 8 }));

      await service.updateTask(5, { assigneeId: 8 }, manager);

      expect(dealsService.getDealForActor).toHaveBeenCalledWith(9, manager);
      expect(clientsService.isAssigned).toHaveBeenCalledWith(3, 8);
      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([
        5,
        { assignee: { connect: { id: 8 } } },
      ]);
    });

    it('answers 400 and changes nothing when the new assignee is not assigned to the client', async () => {
      tasksRepository.findById.mockResolvedValue(withDeal());
      clientsService.isAssigned.mockResolvedValue(false);

      await expect(service.updateTask(5, { assigneeId: 8 }, manager)).rejects.toThrow(
        BadRequestException,
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a new assignee that does not exist', async () => {
      tasksRepository.findById.mockResolvedValue(withDeal());
      usersService.getUserById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(service.updateTask(5, { assigneeId: 999 }, manager)).rejects.toThrow(
        NotFoundException,
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    it('lets an admin hand a deal task to any assigned manager', async () => {
      givenTask(withDeal(), withDeal({ assigneeId: 8 }));

      await service.updateTask(5, { assigneeId: 8 }, admin);

      expect(dealsService.getDealForActor).toHaveBeenCalledWith(9, admin);
      expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    });

    it('lets a manager keep a task without a deal for themselves', async () => {
      givenTask(makeTask({ assigneeId: manager.sub }));

      await service.updateTask(5, { assigneeId: manager.sub }, manager);

      expect(dealsService.getDealForActor).not.toHaveBeenCalled();
      expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    });

    it('forbids a manager to hand a task without a deal to a colleague', async () => {
      tasksRepository.findById.mockResolvedValue(makeTask({ assigneeId: manager.sub }));

      await expect(service.updateTask(5, { assigneeId: 8 }, manager)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    it('lets an admin hand a task without a deal to anybody', async () => {
      givenTask(makeTask(), makeTask({ assigneeId: 8 }));

      await service.updateTask(5, { assigneeId: 8 }, admin);

      expect(tasksRepository.update).toHaveBeenCalledTimes(1);
    });

    it('combines a new assignee with other fields', async () => {
      givenTask(withDeal());

      await service.updateTask(5, { assigneeId: 8, title: 'Renamed' }, manager);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([
        5,
        { title: 'Renamed', assignee: { connect: { id: 8 } } },
      ]);
    });
  });

  describe('updateTaskStatus', () => {
    const statuses = Object.values(TaskStatus);
    const transitions = statuses.flatMap((from) =>
      statuses.map((to): [TaskStatus, TaskStatus] => [from, to]),
    );

    it('sends only the status to the repository', async () => {
      givenTask(makeTask(), makeTask({ status: TaskStatus.DONE }));

      await service.updateTaskStatus(5, TaskStatus.DONE, manager);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { status: TaskStatus.DONE }]);
    });

    it('returns the updated task as a TaskResponseDto with the new status', async () => {
      givenTask(makeTask(), makeTask({ status: TaskStatus.IN_PROGRESS }));

      const result = await service.updateTaskStatus(5, TaskStatus.IN_PROGRESS, manager);

      expect(result).toBeInstanceOf(TaskResponseDto);
      expect(result.id).toBe(5);
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('throws NotFoundException for a task the actor cannot see and updates nothing', async () => {
      tasksRepository.findById.mockResolvedValue(null);

      await expect(service.updateTaskStatus(999, TaskStatus.DONE, manager)).rejects.toThrow(
        new NotFoundException('Task not found'),
      );
      expect(tasksRepository.update).not.toHaveBeenCalled();
    });

    // There are no transition rules yet: any status may follow any other, including itself.
    it.each(transitions)('allows %s -> %s', async (from, to) => {
      givenTask(makeTask({ status: from }), makeTask({ status: to }));

      const result = await service.updateTaskStatus(5, to, manager);

      expect(tasksRepository.update.mock.calls[0]).toStrictEqual([5, { status: to }]);
      expect(result.status).toBe(to);
    });
  });

  describe('countOpenDueTasks', () => {
    const from = new Date('2026-11-08T00:00:00.000Z');
    const before = new Date('2026-11-09T00:00:00.000Z');

    beforeEach(() => {
      tasksRepository.count.mockResolvedValue(3);
    });

    it("counts the manager's own open tasks in the range, among the tasks they may see", async () => {
      await expect(service.countOpenDueTasks(manager, from, before)).resolves.toBe(3);

      expect(tasksRepository.count).toHaveBeenCalledWith({
        assigneeId: 7,
        visibleTo: 7,
        statuses: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
        dueFrom: from,
        dueBefore: before,
      });
    });

    it("counts an admin's own tasks only, without a visibility restriction", async () => {
      await service.countOpenDueTasks(admin, from, before);

      expect(tasksRepository.count).toHaveBeenCalledWith({
        assigneeId: 1,
        visibleTo: undefined,
        statuses: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
        dueFrom: from,
        dueBefore: before,
      });
    });
  });
});
