import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

// Real routing and ValidationPipe; the service is a mock and the guard sets a fixed user.
describe('NotesController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  const user: JwtPayload = { sub: 2, email: 'manager@example.com', role: Role.MANAGER };

  const notesService = {
    createNote: jest.fn(),
    getNotesByDeal: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: NotesService, useValue: notesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = user;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('POST /deals/:dealId/notes passes the trimmed content and the caller', async () => {
    notesService.createNote.mockResolvedValue({ id: 1 });

    await request(app.getHttpServer())
      .post('/deals/7/notes')
      .send({ content: '  hello  ' })
      .expect(201);

    expect(notesService.createNote).toHaveBeenCalledWith(7, 'hello', user);
  });

  it.each([
    ['missing content', {}],
    ['empty content', { content: '' }],
    ['whitespace-only content', { content: '   ' }],
    ['null content', { content: null }],
    ['too long content', { content: 'x'.repeat(5001) }],
    ['unknown field', { content: 'ok', authorId: 5 }],
  ])('POST rejects %s with 400', async (_name, body) => {
    await request(app.getHttpServer()).post('/deals/7/notes').send(body).expect(400);
    expect(notesService.createNote).not.toHaveBeenCalled();
  });

  it('POST rejects a non-numeric deal id with 400', async () => {
    await request(app.getHttpServer()).post('/deals/abc/notes').send({ content: 'ok' }).expect(400);
  });

  it('GET /deals/:dealId/notes lists notes', async () => {
    notesService.getNotesByDeal.mockResolvedValue([]);

    await request(app.getHttpServer()).get('/deals/7/notes').expect(200, []);
    expect(notesService.getNotesByDeal).toHaveBeenCalledWith(7, user);
  });

  it('PATCH /notes/:id updates the content', async () => {
    notesService.updateNote.mockResolvedValue({ id: 10 });

    await request(app.getHttpServer()).patch('/notes/10').send({ content: 'new' }).expect(200);
    expect(notesService.updateNote).toHaveBeenCalledWith(10, 'new', user);
  });

  it('PATCH /notes/:id rejects an empty body with 400', async () => {
    await request(app.getHttpServer()).patch('/notes/10').send({}).expect(400);
  });

  it('DELETE /notes/:id answers 204', async () => {
    notesService.deleteNote.mockResolvedValue(undefined);

    await request(app.getHttpServer()).delete('/notes/10').expect(204);
    expect(notesService.deleteNote).toHaveBeenCalledWith(10, user);
  });
});
