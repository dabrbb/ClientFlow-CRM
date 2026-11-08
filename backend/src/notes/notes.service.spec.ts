import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { DealsService } from 'src/deals/deals.service';
import { NotesRepository, NoteWithAuthor } from './notes.repository';
import { NotesService } from './notes.service';

describe('NotesService', () => {
  const author: JwtPayload = { sub: 2, email: 'author@example.com', role: Role.MANAGER };
  const colleague: JwtPayload = { sub: 3, email: 'colleague@example.com', role: Role.MANAGER };
  const admin: JwtPayload = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };

  const note: NoteWithAuthor = {
    id: 10,
    content: 'Called, will answer on Monday',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    authorId: 2,
    dealId: 7,
    author: { id: 2, name: 'Author', email: 'author@example.com', role: Role.MANAGER },
  };

  let service: NotesService;
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByDeal: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const dealsService = { getDealForActor: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new NotesService(
      repository as unknown as NotesRepository,
      dealsService as unknown as DealsService,
    );
  });

  describe('createNote', () => {
    it('checks access to the deal and stores the note under the caller', async () => {
      dealsService.getDealForActor.mockResolvedValue({ id: 7 });
      repository.create.mockResolvedValue(note);

      const result = await service.createNote(7, 'text', author);

      expect(dealsService.getDealForActor).toHaveBeenCalledWith(7, author);
      expect(repository.create).toHaveBeenCalledWith({
        content: 'text',
        deal: { connect: { id: 7 } },
        author: { connect: { id: 2 } },
      });
      expect(result.id).toBe(10);
    });

    it('does not create anything when the deal is not visible', async () => {
      dealsService.getDealForActor.mockRejectedValue(new NotFoundException('Deal not found'));

      await expect(service.createNote(7, 'text', author)).rejects.toThrow(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('getNotesByDeal', () => {
    it('returns the notes of a visible deal', async () => {
      dealsService.getDealForActor.mockResolvedValue({ id: 7 });
      repository.findByDeal.mockResolvedValue([note]);

      const result = await service.getNotesByDeal(7, colleague);

      expect(result).toHaveLength(1);
      expect(repository.findByDeal).toHaveBeenCalledWith(7);
    });

    it('is 404 when the deal is not visible', async () => {
      dealsService.getDealForActor.mockRejectedValue(new NotFoundException('Deal not found'));

      await expect(service.getNotesByDeal(7, colleague)).rejects.toThrow(NotFoundException);
      expect(repository.findByDeal).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['updateNote', (s: NotesService, actor: JwtPayload) => s.updateNote(10, 'new', actor)],
    ['deleteNote', (s: NotesService, actor: JwtPayload) => s.deleteNote(10, actor)],
  ])('%s', (_name, call) => {
    it('is 404 when the note does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(call(service, author)).rejects.toThrow(new NotFoundException('Note not found'));
    });

    it('is 404 with the same message when the deal is not visible to the caller', async () => {
      repository.findById.mockResolvedValue(note);
      dealsService.getDealForActor.mockRejectedValue(new NotFoundException('Deal not found'));

      await expect(call(service, author)).rejects.toThrow(new NotFoundException('Note not found'));
    });

    it('is 403 for a colleague who sees the deal but is not the author', async () => {
      repository.findById.mockResolvedValue(note);
      dealsService.getDealForActor.mockResolvedValue({ id: 7 });

      await expect(call(service, colleague)).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('lets the author through', async () => {
      repository.findById.mockResolvedValue(note);
      dealsService.getDealForActor.mockResolvedValue({ id: 7 });
      repository.update.mockResolvedValue(note);

      await expect(call(service, author)).resolves.not.toThrow();
    });

    it('lets an admin through', async () => {
      repository.findById.mockResolvedValue(note);
      dealsService.getDealForActor.mockResolvedValue({ id: 7 });
      repository.update.mockResolvedValue(note);

      await expect(call(service, admin)).resolves.not.toThrow();
    });
  });

  it('does not hide errors other than "not found" from the deal check', async () => {
    repository.findById.mockResolvedValue(note);
    dealsService.getDealForActor.mockRejectedValue(new Error('db down'));

    await expect(service.deleteNote(10, author)).rejects.toThrow('db down');
  });
});
