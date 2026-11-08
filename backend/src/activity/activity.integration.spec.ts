// Must stay the first import: it sets the environment AppModule validates while it is loaded.
import './integration-env-spec';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, Prisma, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';

// The real AppModule, so the real APP_INTERCEPTOR registration, guards, pipes, controllers and
// services take part. Only PrismaService is replaced (otherwise it would connect to a database);
// the activity log write is observed on that replacement. The unit tests of the interceptor, the
// mappers and the repository cover the details; this file only proves they work together.

describe('Activity log through the real AppModule', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let managerToken: string;

  const prisma = {
    client: {
      create: jest.fn<Promise<Client>, [Prisma.ClientCreateArgs]>(),
      findMany: jest.fn<Promise<unknown[]>, [Prisma.ClientFindManyArgs]>(),
      count: jest.fn<Promise<number>, [Prisma.ClientCountArgs]>(),
    },
    activityLog: {
      createMany: jest.fn<Promise<Prisma.BatchPayload>, [Prisma.ActivityLogCreateManyArgs]>(),
    },
  };

  const createdClient: Client = {
    id: 5,
    name: 'Acme',
    email: null,
    phone: null,
    status: ClientStatus.LEAD,
    deletedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    userId: 1,
  };

  let loggerError: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useLogger(false);
    // The same pipe as src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const jwt = app.get(JwtService, { strict: false });
    adminToken = await jwt.signAsync({ sub: 1, email: 'admin@example.com', role: Role.ADMIN });
    managerToken = await jwt.signAsync({
      sub: 2,
      email: 'manager@example.com',
      role: Role.MANAGER,
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.client.create.mockResolvedValue(createdClient);
    prisma.client.findMany.mockResolvedValue([]);
    prisma.client.count.mockResolvedValue(0);
    prisma.activityLog.createMany.mockResolvedValue({ count: 1 });
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  const createClient = (token?: string, body: object = { name: 'Acme' }) => {
    const req = request(app.getHttpServer()).post('/clients').send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('logs a successful request on a route marked with @LogActivity, without any manual wiring', async () => {
    const res = await createClient(adminToken).expect(201);

    expect(res.body).toMatchObject({ id: 5, name: 'Acme' });
    expect(prisma.activityLog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.createMany).toHaveBeenCalledWith({
      data: [{ userId: 1, action: 'CREATE', entity: 'Client', entityId: 5 }],
    });
  });

  it('writes nothing for a route without @LogActivity', async () => {
    await request(app.getHttpServer())
      .get('/clients/pool')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(prisma.client.findMany).toHaveBeenCalled();
    expect(prisma.activityLog.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid body (400)', () => createClient(adminToken, { name: 'A' })],
    ['no token (401)', () => createClient(undefined)],
    ['a manager on an admin-only route (403)', () => createClient(managerToken)],
  ])('writes nothing when the request is rejected: %s', async (_name, send) => {
    const res = await send();

    expect([400, 401, 403]).toContain(res.status);
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.createMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the handler itself fails, and keeps its error', async () => {
    prisma.client.create.mockRejectedValue(new Error('db down'));

    await createClient(adminToken).expect(500);

    expect(prisma.activityLog.createMany).not.toHaveBeenCalled();
  });

  it('keeps the response of the main handler when writing the activity fails', async () => {
    prisma.activityLog.createMany.mockRejectedValue(new Error('activity table is gone'));

    const res = await createClient(adminToken).expect(201);

    expect(res.body).toMatchObject({ id: 5, name: 'Acme' });
    expect(prisma.client.create).toHaveBeenCalledTimes(1);
    expect(prisma.activityLog.createMany).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Activity not logged'),
      expect.any(String),
    );
  });
});
