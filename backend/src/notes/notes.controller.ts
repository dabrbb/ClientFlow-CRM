import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { NoteContentDto } from './dto/note-content.dto';
import { NoteResponseDto } from './dto/note-response.dto';
import { NotesService } from './notes.service';

// Notes are created and listed through their deal, and changed by their own id.
@Controller()
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post('deals/:dealId/notes')
  async create(
    @Param('dealId', ParseIntPipe) dealId: number,
    @Body() dto: NoteContentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<NoteResponseDto> {
    return this.notesService.createNote(dealId, dto.content, user);
  }

  @Get('deals/:dealId/notes')
  async findByDeal(
    @Param('dealId', ParseIntPipe) dealId: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<NoteResponseDto[]> {
    return this.notesService.getNotesByDeal(dealId, user);
  }

  @Patch('notes/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteContentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<NoteResponseDto> {
    return this.notesService.updateNote(id, dto.content, user);
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.notesService.deleteNote(id, user);
  }
}
