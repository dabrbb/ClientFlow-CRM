import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { DealsController } from './deals.controller';
import { DealsRepository } from './deals.repository';
import { DealsService } from './deals.service';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [PrismaModule, ClientsModule],
  controllers: [DealsController],
  providers: [DealsRepository, DealsService],
  exports: [DealsRepository, DealsService],
})
export class DealsModule {}
