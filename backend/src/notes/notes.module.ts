import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DealsModule } from 'src/deals/deals.module';
import { NotesController } from './notes.controller';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

@Module({
  imports: [PrismaModule, DealsModule],
  controllers: [NotesController],
  providers: [NotesRepository, NotesService],
  exports: [NotesService],
})
export class NotesModule {}
