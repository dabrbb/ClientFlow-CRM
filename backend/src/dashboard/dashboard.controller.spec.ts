import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  const user: JwtPayload = { sub: 2, email: 'manager@example.com', role: Role.MANAGER };
  const dashboardService = { getDashboard: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = user;
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

  it('GET /dashboard returns the numbers computed for the signed-in user', async () => {
    const body = {
      clients: 1,
      activeDeals: 2,
      wonDeals: 3,
      lostDeals: 4,
      tasksToday: 5,
      revenue: 6,
    };
    dashboardService.getDashboard.mockResolvedValue(body);

    await request(app.getHttpServer()).get('/dashboard').expect(200, body);
    expect(dashboardService.getDashboard).toHaveBeenCalledWith(user);
  });
});
