import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ActivityController } from './activity.controller';
import { ActivityInterceptor } from './activity.interceptor';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';

// Other modules do not import this one: they only mark routes with the @LogActivity decorator,
// and the global interceptor below does the rest.
@Module({
  imports: [PrismaModule],
  controllers: [ActivityController],
  providers: [
    ActivityRepository,
    ActivityService,
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
})
export class ActivityModule {}
