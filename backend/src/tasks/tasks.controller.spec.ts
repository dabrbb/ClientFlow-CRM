import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, Task, TaskStatus } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { TaskResponseDto } from './dto/task-response.dto';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

// These tests go through real HTTP routing and the global ValidationPipe, but the service is a
// mock and the auth guard is replaced, so no database or token is involved.
describe('TasksController (HTTP, no database)', () => {
  let app: INestApplication<App>;

  const tasksService = {
    createTask: jest.fn<
      ReturnType<TasksService['createTask']>,
      Parameters<TasksService['createTask']>
    >(),
    getAllTasks: jest.fn<
      ReturnType<TasksService['getAllTasks']>,
      Parameters<TasksService['getAllTasks']>
    >(),
    getTaskById: jest.fn<
      ReturnType<TasksService['getTaskById']>,
      Parameters<TasksService['getTaskById']>
    >(),
    updateTask: jest.fn<
      ReturnType<TasksService['updateTask']>,
      Parameters<TasksService['updateTask']>
    >(),
    updateTaskStatus: jest.fn<
      ReturnType<TasksService['updateTaskStatus']>,
      Parameters<TasksService['updateTaskStatus']>
    >(),
  };

  const makeResponse = (status: TaskStatus = TaskStatus.TODO): TaskResponseDto =>
    new TaskResponseDto({
      id: 5,
      title: 'Call the client',
      description: null,
      status,
      dueDate: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      assigneeId: 2,
      dealId: null,
      assignee: { id: 2, name: 'Manager', email: 'manager@example.com', role: Role.MANAGER },
      deal: null,
    });

  // createTask returns the bare entity, without the relations of the response DTO.
  const createdTask: Task = {
    id: 5,
    title: 'Call the client',
    description: null,
    status: TaskStatus.TODO,
    dueDate: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    assigneeId: 2,
    dealId: null,
  };

  // What the client receives: dates become strings.
  const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: tasksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Same options as the global pipe in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('PATCH /tasks/:id/status', () => {
    it.each(Object.values(TaskStatus))('accepts %s and returns the task', async (status) => {
      tasksService.updateTaskStatus.mockResolvedValue(makeResponse(status));

      const res = await request(app.getHttpServer()).patch('/tasks/5/status').send({ status });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(asJson(makeResponse(status)));
      expect(tasksService.updateTaskStatus).toHaveBeenCalledWith(5, status);
    });

    it('passes the id to the service as a number', async () => {
      tasksService.updateTaskStatus.mockResolvedValue(makeResponse());

      await request(app.getHttpServer()).patch('/tasks/12/status').send({ status: 'DONE' });

      expect(tasksService.updateTaskStatus.mock.calls[0][0]).toBe(12);
    });

    it('does not go through the general update', async () => {
      tasksService.updateTaskStatus.mockResolvedValue(makeResponse());

      await request(app.getHttpServer()).patch('/tasks/5/status').send({ status: 'DONE' });

      expect(tasksService.updateTask).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown> | undefined]>([
      ['no body', undefined],
      ['an empty body', {}],
      ['status null', { status: null }],
      ['a lowercase status', { status: 'done' }],
      ['an unknown status', { status: 'ARCHIVED' }],
      ['a field besides status', { status: 'DONE', title: 'Sneaky rename' }],
    ])('rejects %s with 400 and does not call the service', async (_label, body) => {
      const res = await request(app.getHttpServer()).patch('/tasks/5/status').send(body);

      expect(res.status).toBe(400);
      expect(tasksService.updateTaskStatus).not.toHaveBeenCalled();
    });

    it('lists the allowed values in the error for a bad status', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tasks/5/status')
        .send({ status: 'ARCHIVED' });

      expect(res.body).toHaveProperty(
        'message',
        expect.arrayContaining([
          'status must be one of the following values: TODO, IN_PROGRESS, DONE, CANCELLED',
        ]),
      );
    });

    it('rejects a non-numeric id with 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tasks/abc/status')
        .send({ status: 'DONE' });

      expect(res.status).toBe(400);
      expect(tasksService.updateTaskStatus).not.toHaveBeenCalled();
    });

    it('answers 400, not 404, for a bad status on a task that does not exist', async () => {
      tasksService.updateTaskStatus.mockRejectedValue(new NotFoundException('Task not found'));

      const res = await request(app.getHttpServer())
        .patch('/tasks/999/status')
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(400);
    });

    it('passes a 404 from the service through', async () => {
      tasksService.updateTaskStatus.mockRejectedValue(new NotFoundException('Task not found'));

      const res = await request(app.getHttpServer())
        .patch('/tasks/999/status')
        .send({ status: 'DONE' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message', 'Task not found');
    });
  });

  describe('PATCH /tasks/:id (existing route)', () => {
    it('does not reach updateTaskStatus', async () => {
      tasksService.updateTask.mockResolvedValue(makeResponse());

      await request(app.getHttpServer()).patch('/tasks/5').send({ status: 'DONE' });

      expect(tasksService.updateTaskStatus).not.toHaveBeenCalled();
    });

    it('still routes to updateTask with only the fields that were sent', async () => {
      tasksService.updateTask.mockResolvedValue(makeResponse());

      const res = await request(app.getHttpServer()).patch('/tasks/5').send({ title: 'New title' });

      expect(res.status).toBe(200);
      const [id, dto] = tasksService.updateTask.mock.calls[0];
      expect(id).toBe(5);
      expect(dto.title).toBe('New title');
      // Fields that were not sent stay undefined, which Prisma treats as "do not change".
      expect(dto.description).toBeUndefined();
      expect(dto.status).toBeUndefined();
      expect(dto.dueDate).toBeUndefined();
    });

    it('still accepts a status change through the general update', async () => {
      tasksService.updateTask.mockResolvedValue(makeResponse(TaskStatus.DONE));

      const res = await request(app.getHttpServer()).patch('/tasks/5').send({ status: 'DONE' });

      expect(res.status).toBe(200);
      expect(tasksService.updateTask.mock.calls[0][1].status).toBe(TaskStatus.DONE);
    });

    it('still rejects an unknown status with 400', async () => {
      const res = await request(app.getHttpServer()).patch('/tasks/5').send({ status: 'bogus' });

      expect(res.status).toBe(400);
      expect(tasksService.updateTask).not.toHaveBeenCalled();
    });

    it('still rejects a non-numeric id with 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tasks/abc')
        .send({ title: 'New title' });

      expect(res.status).toBe(400);
      expect(tasksService.updateTask).not.toHaveBeenCalled();
    });

    it('still passes a 404 from the service through', async () => {
      tasksService.updateTask.mockRejectedValue(new NotFoundException('Task not found'));

      const res = await request(app.getHttpServer())
        .patch('/tasks/999')
        .send({ title: 'New title' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message', 'Task not found');
    });
  });

  describe('other existing routes', () => {
    it('GET /tasks/:id calls getTaskById with a number', async () => {
      tasksService.getTaskById.mockResolvedValue(makeResponse());

      const res = await request(app.getHttpServer()).get('/tasks/5');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(asJson(makeResponse()));
      expect(tasksService.getTaskById).toHaveBeenCalledWith(5);
    });

    it('GET /tasks calls getAllTasks', async () => {
      tasksService.getAllTasks.mockResolvedValue([makeResponse()]);

      const res = await request(app.getHttpServer()).get('/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(asJson([makeResponse()]));
    });

    it('POST /tasks calls createTask with the validated body', async () => {
      tasksService.createTask.mockResolvedValue(createdTask);

      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Call the client', assigneeId: 2 });

      expect(res.status).toBe(201);
      expect(tasksService.createTask.mock.calls[0][0]).toMatchObject({
        title: 'Call the client',
        assigneeId: 2,
      });
    });
  });
});
