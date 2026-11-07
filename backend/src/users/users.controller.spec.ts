import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role, User } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Real HTTP routing and the real RolesGuard; the service is a mock and the JWT guard is replaced
// by one that puts a fixed user on the request (or rejects, when nobody is signed in).
describe('UsersController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  let signedInUser: JwtPayload | null;

  const usersService = {
    getColleagues: jest.fn<
      ReturnType<UsersService['getColleagues']>,
      Parameters<UsersService['getColleagues']>
    >(),
    getAllUsers: jest.fn<
      ReturnType<UsersService['getAllUsers']>,
      Parameters<UsersService['getAllUsers']>
    >(),
  };

  const fullUser = (id: number, name: string, role: Role): User => ({
    id,
    name,
    role,
    email: `${name.toLowerCase()}@example.com`,
    passwordHash: 'secret-hash',
    hashedRefreshToken: 'secret-refresh-hash',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!signedInUser) {
            return false;
          }
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = signedInUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    signedInUser = { sub: 7, email: 'me@example.com', role: Role.MANAGER };
  });

  describe('GET /users/colleagues', () => {
    it('returns only id, name and role to a manager, admins and the caller included', async () => {
      usersService.getColleagues.mockResolvedValue([
        { id: 1, name: 'Alice', role: Role.ADMIN },
        { id: 7, name: 'Me', role: Role.MANAGER },
        { id: 9, name: 'Zed', role: Role.MANAGER },
      ]);

      const res = await request(app.getHttpServer()).get('/users/colleagues');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: 1, name: 'Alice', role: 'ADMIN' },
        { id: 7, name: 'Me', role: 'MANAGER' },
        { id: 9, name: 'Zed', role: 'MANAGER' },
      ]);
    });

    it('never leaks email, password hash, refresh hash or dates, even if the service returns them', async () => {
      // A full row stands in for a future service bug; the DTO must still cut it down.
      usersService.getColleagues.mockResolvedValue([fullUser(1, 'Alice', Role.ADMIN)]);

      const res = await request(app.getHttpServer()).get('/users/colleagues');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, name: 'Alice', role: 'ADMIN' }]);
      expect(JSON.stringify(res.body)).not.toMatch(/secret|email|createdAt/);
    });

    it('works for an admin too', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
      usersService.getColleagues.mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/users/colleagues');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('is rejected without a signed-in user', async () => {
      signedInUser = null;

      const res = await request(app.getHttpServer()).get('/users/colleagues');

      expect(res.status).toBe(403);
      expect(usersService.getColleagues).not.toHaveBeenCalled();
    });
  });

  describe('GET /users', () => {
    it('stays admin-only: a manager gets 403', async () => {
      const res = await request(app.getHttpServer()).get('/users');

      expect(res.status).toBe(403);
      expect(usersService.getAllUsers).not.toHaveBeenCalled();
    });

    it('lets an admin through with the full user data', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
      usersService.getAllUsers.mockResolvedValue([fullUser(1, 'Alice', Role.ADMIN)]);

      const res = await request(app.getHttpServer()).get('/users');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 1,
          name: 'Alice',
          email: 'alice@example.com',
          role: 'ADMIN',
          createdAt: new Date(0).toISOString(),
        },
      ]);
    });
  });
});
