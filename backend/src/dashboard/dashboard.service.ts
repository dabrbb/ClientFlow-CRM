import { Injectable } from '@nestjs/common';
import { DealStage } from '@prisma/client';

import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsService } from 'src/clients/clients.service';
import { DealsService } from 'src/deals/deals.service';
import { TasksService } from 'src/tasks/tasks.service';

import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { utcDayRange } from './utc-day';

const ACTIVE_STAGES: DealStage[] = [DealStage.NEW, DealStage.QUALIFICATION, DealStage.NEGOTIATION];

@Injectable()
export class DashboardService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly dealsService: DealsService,
    private readonly tasksService: TasksService,
  ) {}

  // Every number covers only what the actor may see: the other services apply the access scope.
  async getDashboard(actor: JwtPayload, now: Date = new Date()): Promise<DashboardResponseDto> {
    const { from, before } = utcDayRange(now);

    const [clients, stageStats, tasksToday] = await Promise.all([
      this.clientsService.countVisibleClients(actor),
      this.dealsService.getStageStats(actor),
      this.tasksService.countOpenDueTasks(actor, from, before),
    ]);

    const countOf = (stages: DealStage[]) =>
      stageStats.filter((s) => stages.includes(s.stage)).reduce((sum, s) => sum + s.count, 0);
    const wonValue = stageStats
      .filter((s) => s.stage === DealStage.WON)
      .reduce((sum, s) => sum + s.valueSum, 0);

    return {
      clients,
      activeDeals: countOf(ACTIVE_STAGES),
      wonDeals: countOf([DealStage.WON]),
      lostDeals: countOf([DealStage.LOST]),
      tasksToday,
      // Values are floats, so round away the binary noise of the sum.
      revenue: Math.round(wonValue * 100) / 100,
    };
  }
}
