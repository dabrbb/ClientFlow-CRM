import { DealStage, Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsService } from 'src/clients/clients.service';
import { DealsService } from 'src/deals/deals.service';
import { TasksService } from 'src/tasks/tasks.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const manager: JwtPayload = { sub: 2, email: 'm@example.com', role: Role.MANAGER };
  const now = new Date('2026-11-08T16:54:00.000Z');

  const clientsService = { countVisibleClients: jest.fn() };
  const dealsService = { getStageStats: jest.fn() };
  const tasksService = { countOpenDueTasks: jest.fn() };

  let service: DashboardService;

  beforeEach(() => {
    jest.resetAllMocks();
    clientsService.countVisibleClients.mockResolvedValue(0);
    dealsService.getStageStats.mockResolvedValue([]);
    tasksService.countOpenDueTasks.mockResolvedValue(0);

    service = new DashboardService(
      clientsService as unknown as ClientsService,
      dealsService as unknown as DealsService,
      tasksService as unknown as TasksService,
    );
  });

  it('returns zeros when there is nothing', async () => {
    await expect(service.getDashboard(manager, now)).resolves.toEqual({
      clients: 0,
      activeDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      tasksToday: 0,
      revenue: 0,
    });
  });

  it('builds the numbers from the per-stage stats', async () => {
    clientsService.countVisibleClients.mockResolvedValue(142);
    tasksService.countOpenDueTasks.mockResolvedValue(9);
    dealsService.getStageStats.mockResolvedValue([
      { stage: DealStage.NEW, count: 10, valueSum: 1000 },
      { stage: DealStage.QUALIFICATION, count: 11, valueSum: 2000 },
      { stage: DealStage.NEGOTIATION, count: 10, valueSum: 3000 },
      { stage: DealStage.WON, count: 12, valueSum: 18500 },
      { stage: DealStage.LOST, count: 3, valueSum: 700 },
    ]);

    await expect(service.getDashboard(manager, now)).resolves.toEqual({
      clients: 142,
      activeDeals: 31,
      wonDeals: 12,
      lostDeals: 3,
      tasksToday: 9,
      revenue: 18500,
    });
  });

  it('counts only WON deals in revenue, and rounds away float noise', async () => {
    dealsService.getStageStats.mockResolvedValue([
      { stage: DealStage.WON, count: 2, valueSum: 0.1 + 0.2 },
      { stage: DealStage.LOST, count: 1, valueSum: 999 },
    ]);

    const result = await service.getDashboard(manager, now);

    expect(result.revenue).toBe(0.3);
  });

  it('asks the other services on behalf of the caller, with the UTC day of now', async () => {
    await service.getDashboard(manager, now);

    expect(clientsService.countVisibleClients).toHaveBeenCalledWith(manager);
    expect(dealsService.getStageStats).toHaveBeenCalledWith(manager);
    expect(tasksService.countOpenDueTasks).toHaveBeenCalledWith(
      manager,
      new Date('2026-11-08T00:00:00.000Z'),
      new Date('2026-11-09T00:00:00.000Z'),
    );
  });
});
