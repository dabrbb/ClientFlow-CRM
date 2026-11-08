import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ACTIVITY_ACTIONS, ACTIVITY_ENTITIES } from './activity-actions';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

describe('ActivityController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  let signedInUser: JwtPayload;

  const activityService = { getActivity: jest.fn() };
  const emptyList = { data: [], meta: { page: 1, limit: 20, total: 0, pages: 0 } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [{ provide: ActivityService, useValue: activityService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = signedInUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    activityService.getActivity.mockResolvedValue(emptyList);
    signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
  });

  const get = (query = '') => request(app.getHttpServer()).get(`/activity${query}`);

  it('lets an admin read the log', async () => {
    await get().expect(200, emptyList);
  });

  it('refuses a manager with 403', async () => {
    signedInUser = { sub: 2, email: 'm@example.com', role: Role.MANAGER };

    await get().expect(403);
    expect(activityService.getActivity).not.toHaveBeenCalled();
  });

  it('defaults to page 1 and 20 per page', async () => {
    await get().expect(200);

    expect(activityService.getActivity).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('passes parsed filters to the service as numbers', async () => {
    await get('?page=2&limit=50&entity=Task&entityId=4&action=ASSIGN&userId=2').expect(200);

    expect(activityService.getActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        entity: 'Task',
        entityId: 4,
        action: 'ASSIGN',
        userId: 2,
      }),
    );
  });

  it.each(ACTIVITY_ACTIONS)('accepts the action %s from the central list', async (action) => {
    await get(`?action=${action}`).expect(200);
  });

  it.each(ACTIVITY_ENTITIES)('accepts the entity %s from the central list', async (entity) => {
    await get(`?entity=${entity}`).expect(200);
  });

  it.each([
    ['an unknown action', '?action=HACK'],
    ['a lower-case action', '?action=assign'],
    ['an empty action', '?action='],
    ['an unknown entity', '?entity=User'],
    ['limit above the maximum', '?limit=101'],
    ['limit zero', '?limit=0'],
    ['page zero', '?page=0'],
    ['a non-numeric page', '?page=abc'],
    ['a non-numeric entityId', '?entityId=abc'],
    ['userId zero', '?userId=0'],
    ['a date-time without a zone', '?createdAfter=2026-11-08T10:00:00'],
    ['an impossible date', '?createdBefore=2026-02-30'],
    ['an unknown parameter', '?foo=1'],
    ['a repeated action', '?action=CLAIM&action=ASSIGN'],
  ])('rejects %s with 400', async (_name, query) => {
    await get(query).expect(400);
    expect(activityService.getActivity).not.toHaveBeenCalled();
  });

  it('accepts the maximum limit of 100', async () => {
    await get('?limit=100').expect(200);
  });

  it('accepts a plain date and an instant with an encoded offset', async () => {
    await get('?createdAfter=2026-11-01&createdBefore=2026-11-08T10:00:00%2B03:00').expect(200);
  });

  it('has no write routes: POST, PATCH, PUT and DELETE are not found', async () => {
    const server = app.getHttpServer();

    await request(server).post('/activity').send({}).expect(404);
    await request(server).patch('/activity/1').send({}).expect(404);
    await request(server).put('/activity/1').send({}).expect(404);
    await request(server).delete('/activity/1').expect(404);
  });
});
