import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { DealsModule } from 'src/deals/deals.module';
import { TasksModule } from 'src/tasks/tasks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ClientsModule, DealsModule, TasksModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
