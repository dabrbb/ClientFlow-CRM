import {
  ConflictException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientResponseDto } from './dto/clients-response.dto';
import { PoolResponseDto } from './dto/pool-response.dto';

// Real routing, pipes and RolesGuard; the service is a mock and the JWT guard puts a fixed user
// on the request, so no database or token is involved.
describe('ClientsController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  let signedInUser: JwtPayload;

  const clientsService = {
    createClient: jest.fn<
      ReturnType<ClientsService['createClient']>,
      Parameters<ClientsService['createClient']>
    >(),
    getClientForActor: jest.fn<
      ReturnType<ClientsService['getClientForActor']>,
      Parameters<ClientsService['getClientForActor']>
    >(),
    getAllClients: jest.fn<
      ReturnType<ClientsService['getAllClients']>,
      Parameters<ClientsService['getAllClients']>
    >(),
    updateClient: jest.fn<
      ReturnType<ClientsService['updateClient']>,
      Parameters<ClientsService['updateClient']>
    >(),
    getPool: jest.fn<
      ReturnType<ClientsService['getPool']>,
      Parameters<ClientsService['getPool']>
    >(),
    claimClient: jest.fn<
      ReturnType<ClientsService['claimClient']>,
      Parameters<ClientsService['claimClient']>
    >(),
    getManagers: jest.fn<
      ReturnType<ClientsService['getManagers']>,
      Parameters<ClientsService['getManagers']>
    >(),
    addManager: jest.fn<
      ReturnType<ClientsService['addManager']>,
      Parameters<ClientsService['addManager']>
    >(),
    removeManager: jest.fn<
      ReturnType<ClientsService['removeManager']>,
      Parameters<ClientsService['removeManager']>
    >(),
  };

  const aClient: Client = {
    id: 5,
    name: 'Acme',
    email: 'a@acme.com',
    phone: null,
    status: ClientStatus.LEAD,
    deletedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    userId: 1,
  };

  const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [{ provide: ClientsService, useValue: clientsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = signedInUser;
          return true;
        },
      })
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
    signedInUser = { sub: 7, email: 'manager@example.com', role: Role.MANAGER };
  });

  describe('POST /clients', () => {
    it('is forbidden for a manager and does not reach the service', async () => {
      const res = await request(app.getHttpServer()).post('/clients').send({ name: 'Acme' });

      expect(res.status).toBe(403);
      expect(clientsService.createClient).not.toHaveBeenCalled();
    });

    it('lets an admin create a client and passes the admin to the service', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
      clientsService.createClient.mockResolvedValue(aClient);

      const res = await request(app.getHttpServer())
        .post('/clients')
        .send({ name: 'Acme', email: 'a@acme.com' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(asJson(aClient));
      expect(clientsService.createClient).toHaveBeenCalledWith(
        { name: 'Acme', email: 'a@acme.com' },
        signedInUser,
      );
    });

    it('still rejects unknown fields with 400 for an admin', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };

      const res = await request(app.getHttpServer())
        .post('/clients')
        .send({ name: 'Acme', userId: 99 });

      expect(res.status).toBe(400);
      expect(clientsService.createClient).not.toHaveBeenCalled();
    });
  });

  describe('GET /clients', () => {
    it('passes the signed-in user to the service', async () => {
      clientsService.getAllClients.mockResolvedValue(new ClientResponseDto([aClient], 1, 10, 1));

      const res = await request(app.getHttpServer()).get('/clients');

      expect(res.status).toBe(200);
      expect(clientsService.getAllClients).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10 }),
        signedInUser,
      );
    });

    it('ignores a managerId in the query: it is rejected as an unknown parameter', async () => {
      const res = await request(app.getHttpServer()).get('/clients?managerId=2');

      expect(res.status).toBe(400);
      expect(clientsService.getAllClients).not.toHaveBeenCalled();
    });
  });

  describe('GET /clients/:id', () => {
    it('passes the id and the signed-in user to the service', async () => {
      clientsService.getClientForActor.mockResolvedValue(aClient);

      const res = await request(app.getHttpServer()).get('/clients/5');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(asJson(aClient));
      expect(clientsService.getClientForActor).toHaveBeenCalledWith(5, signedInUser);
    });

    it('answers 404 when the service hides the client', async () => {
      clientsService.getClientForActor.mockRejectedValue(new NotFoundException('Client not found'));

      const res = await request(app.getHttpServer()).get('/clients/5');

      expect(res.status).toBe(404);
    });

    it('rejects a non-numeric id with 400', async () => {
      const res = await request(app.getHttpServer()).get('/clients/abc');

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /clients/:id', () => {
    it('passes the id, the body and the signed-in user to the service', async () => {
      clientsService.updateClient.mockResolvedValue({ ...aClient, name: 'New' });

      const res = await request(app.getHttpServer()).patch('/clients/5').send({ name: 'New' });

      expect(res.status).toBe(200);
      expect(clientsService.updateClient).toHaveBeenCalledWith(5, { name: 'New' }, signedInUser);
    });

    it('answers 404 when the service hides the client', async () => {
      clientsService.updateClient.mockRejectedValue(new NotFoundException('Client not found'));

      const res = await request(app.getHttpServer()).patch('/clients/5').send({ name: 'New' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /clients/pool', () => {
    it('is routed to the pool, not read as a client id', async () => {
      clientsService.getPool.mockResolvedValue(new PoolResponseDto([], 1, 10, 0));

      const res = await request(app.getHttpServer()).get('/clients/pool');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 10, total: 0, pages: 0 } });
      expect(clientsService.getClientForActor).not.toHaveBeenCalled();
    });

    it('reads page and limit from the query and applies defaults', async () => {
      clientsService.getPool.mockResolvedValue(new PoolResponseDto([], 2, 5, 0));

      await request(app.getHttpServer()).get('/clients/pool?page=2&limit=5');
      await request(app.getHttpServer()).get('/clients/pool');

      expect(clientsService.getPool.mock.calls[0][0]).toMatchObject({ page: 2, limit: 5 });
      expect(clientsService.getPool.mock.calls[1][0]).toMatchObject({ page: 1, limit: 10 });
    });

    it.each(['page=0', 'limit=0', 'limit=101', 'page=abc', 'search=x', 'status=LEAD'])(
      'rejects %s with 400',
      async (query) => {
        const res = await request(app.getHttpServer()).get(`/clients/pool?${query}`);

        expect(res.status).toBe(400);
        expect(clientsService.getPool).not.toHaveBeenCalled();
      },
    );

    it('returns only id, name, status and createdAt of each client', async () => {
      const row = { id: 5, name: 'Acme', status: ClientStatus.LEAD, createdAt: new Date(0) };
      clientsService.getPool.mockResolvedValue(new PoolResponseDto([row], 1, 10, 1));

      const res = await request(app.getHttpServer()).get('/clients/pool');

      expect(res.body).toMatchObject({ data: [asJson(row)] });
    });
  });

  describe('POST /clients/:id/claim', () => {
    it('passes the id and the signed-in user to the service', async () => {
      clientsService.claimClient.mockResolvedValue(aClient);

      const res = await request(app.getHttpServer()).post('/clients/5/claim');

      expect(res.status).toBe(201);
      expect(res.body).toEqual(asJson(aClient));
      expect(clientsService.claimClient).toHaveBeenCalledWith(5, signedInUser);
    });

    it('answers 409 when the service reports the client is taken', async () => {
      clientsService.claimClient.mockRejectedValue(new ConflictException('taken'));

      const res = await request(app.getHttpServer()).post('/clients/5/claim');

      expect(res.status).toBe(409);
    });

    it('rejects a non-numeric id with 400', async () => {
      const res = await request(app.getHttpServer()).post('/clients/abc/claim');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /clients/:id/managers', () => {
    it('returns the managers of the client', async () => {
      const managers = [{ id: 7, name: 'Me', role: Role.MANAGER, assignedAt: new Date(0) }];
      clientsService.getManagers.mockResolvedValue(managers);

      const res = await request(app.getHttpServer()).get('/clients/5/managers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(asJson(managers));
      expect(clientsService.getManagers).toHaveBeenCalledWith(5, signedInUser);
    });

    it('answers 404 when the service hides the client', async () => {
      clientsService.getManagers.mockRejectedValue(new NotFoundException('Client not found'));

      const res = await request(app.getHttpServer()).get('/clients/5/managers');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /clients/:id/managers', () => {
    const added = { id: 9, name: 'Zed', role: Role.MANAGER, assignedAt: new Date(0) };

    it('adds the user and passes the id, the user id and the caller to the service', async () => {
      clientsService.addManager.mockResolvedValue(added);

      const res = await request(app.getHttpServer())
        .post('/clients/5/managers')
        .send({ userId: 9 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(asJson(added));
      expect(clientsService.addManager).toHaveBeenCalledWith(5, 9, signedInUser);
    });

    it.each([
      ['a missing userId', {}],
      ['a string userId', { userId: '9' }],
      ['a zero userId', { userId: 0 }],
      ['a negative userId', { userId: -1 }],
      ['a fractional userId', { userId: 1.5 }],
      ['an unknown field', { userId: 9, role: 'ADMIN' }],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await request(app.getHttpServer()).post('/clients/5/managers').send(body);

      expect(res.status).toBe(400);
      expect(clientsService.addManager).not.toHaveBeenCalled();
    });

    it('answers 409 when the user is already assigned', async () => {
      clientsService.addManager.mockRejectedValue(new ConflictException('already'));

      const res = await request(app.getHttpServer())
        .post('/clients/5/managers')
        .send({ userId: 9 });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /clients/:id/managers/:userId', () => {
    it('answers 204 without a body and passes both ids and the caller on', async () => {
      clientsService.removeManager.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete('/clients/5/managers/9');

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(clientsService.removeManager).toHaveBeenCalledWith(5, 9, signedInUser);
    });

    it('answers 404 when that user is not assigned', async () => {
      clientsService.removeManager.mockRejectedValue(new NotFoundException('not assigned'));

      const res = await request(app.getHttpServer()).delete('/clients/5/managers/9');

      expect(res.status).toBe(404);
    });

    it('rejects a non-numeric user id with 400', async () => {
      const res = await request(app.getHttpServer()).delete('/clients/5/managers/abc');

      expect(res.status).toBe(400);
      expect(clientsService.removeManager).not.toHaveBeenCalled();
    });
  });
});
