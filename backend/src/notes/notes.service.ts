import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { DealsService } from 'src/deals/deals.service';

import { NoteResponseDto } from './dto/note-response.dto';
import { NotesRepository, NoteWithAuthor } from './notes.repository';

@Injectable()
export class NotesService {
  constructor(
    private readonly notesRepository: NotesRepository,
    private readonly dealsService: DealsService,
  ) {}

  // A note inherits the access of its deal: if the caller cannot see the deal (and so its
  // client), the note is reported as missing, the same as a note that does not exist.
  private async getNoteForActor(id: number, actor: JwtPayload): Promise<NoteWithAuthor> {
    const note = await this.notesRepository.findById(id);

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    try {
      await this.dealsService.getDealForActor(note.dealId, actor);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Note not found');
      }
      throw error;
    }

    return note;
  }

  // Seeing a note is not enough to change it: only its author or an admin may.
  private assertCanModify(note: NoteWithAuthor, actor: JwtPayload): void {
    if (actor.role !== Role.ADMIN && note.authorId !== actor.sub) {
      throw new ForbiddenException('Only the author or an admin can change this note');
    }
  }

  async createNote(dealId: number, content: string, actor: JwtPayload): Promise<NoteResponseDto> {
    await this.dealsService.getDealForActor(dealId, actor);

    const note = await this.notesRepository.create({
      content,
      deal: { connect: { id: dealId } },
      author: { connect: { id: actor.sub } },
    });

    return new NoteResponseDto(note);
  }

  async getNotesByDeal(dealId: number, actor: JwtPayload): Promise<NoteResponseDto[]> {
    await this.dealsService.getDealForActor(dealId, actor);

    const notes = await this.notesRepository.findByDeal(dealId);

    return notes.map((note) => new NoteResponseDto(note));
  }

  async updateNote(id: number, content: string, actor: JwtPayload): Promise<NoteResponseDto> {
    const note = await this.getNoteForActor(id, actor);
    this.assertCanModify(note, actor);

    return new NoteResponseDto(await this.notesRepository.update(id, content));
  }

  async deleteNote(id: number, actor: JwtPayload): Promise<void> {
    const note = await this.getNoteForActor(id, actor);
    this.assertCanModify(note, actor);

    await this.notesRepository.delete(id);
  }
}
