import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { UsersModule } from 'src/users/users.module';
import { DealsModule } from 'src/deals/deals.module';

@Module({
  imports: [PrismaModule, UsersModule, DealsModule],

  controllers: [TasksController],

  providers: [TasksRepository, TasksService],

  exports: [TasksRepository, TasksService],
})
export class TasksModule {}
