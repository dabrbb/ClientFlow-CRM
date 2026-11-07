import {
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, DealStage, Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsService } from 'src/clients/clients.service';
import { DealsController } from './deals.controller';
import { DealsRepository, DealWithClient } from './deals.repository';
import { DealsService } from './deals.service';

// Real routing, real ValidationPipe and the real DealsService; only the repository and the
// ClientsService are mocks and the auth guard is replaced, so no database or token is involved.
describe('DealsController (HTTP, no database)', () => {
  let app: INestApplication<App>;
  let signedInUser: JwtPayload;

  const dealsRepository = {
    create: jest.fn<ReturnType<DealsRepository['create']>, Parameters<DealsRepository['create']>>(),
    findById: jest.fn<
      ReturnType<DealsRepository['findById']>,
      Parameters<DealsRepository['findById']>
    >(),
    findAll: jest.fn<
      ReturnType<DealsRepository['findAll']>,
      Parameters<DealsRepository['findAll']>
    >(),
    update: jest.fn<ReturnType<DealsRepository['update']>, Parameters<DealsRepository['update']>>(),
  };

  const clientsService = {
    getClientForActor: jest.fn<
      ReturnType<ClientsService['getClientForActor']>,
      Parameters<ClientsService['getClientForActor']>
    >(),
  };

  const makeClient = (): Client => ({
    id: 3,
    name: 'Acme',
    email: 'acme@example.com',
    phone: '12345',
    status: ClientStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    userId: 1,
  });

  const makeDeal = (overrides: Partial<DealWithClient> = {}): DealWithClient => ({
    id: 5,
    title: 'Big deal',
    value: 1500,
    stage: DealStage.NEW,
    expectedCloseDate: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    clientId: 3,
    client: makeClient(),
    ...overrides,
  });

  const publicDeal = {
    id: 5,
    title: 'Big deal',
    value: 1500,
    stage: 'NEW',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    client: { id: 3, name: 'Acme', email: 'acme@example.com', phone: '12345', status: 'ACTIVE' },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DealsController],
      providers: [
        DealsService,
        { provide: DealsRepository, useValue: dealsRepository },
        { provide: ClientsService, useValue: clientsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().user = signedInUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Same options as the global pipe in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    signedInUser = { sub: 7, email: 'manager@example.com', role: Role.MANAGER };
  });

  describe('POST /deals', () => {
    beforeEach(() => {
      clientsService.getClientForActor.mockResolvedValue(makeClient());
      dealsRepository.create.mockResolvedValue(makeDeal());
    });

    it('creates a deal from the minimal body and returns the public shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(publicDeal);
      // toHaveProperty with a value compares the whole object, so no extra client field can slip in.
      expect(res.body).toHaveProperty('client', publicDeal.client);
      expect(clientsService.getClientForActor).toHaveBeenCalledWith(3, signedInUser);
      expect(dealsRepository.create.mock.calls[0][0]).toEqual({
        title: 'Big deal',
        client: { connect: { id: 3 } },
      });
    });

    it('passes value and stage to the repository', async () => {
      await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', value: 1500.5, stage: 'NEGOTIATION', clientId: 3 });

      expect(dealsRepository.create.mock.calls[0][0]).toEqual({
        title: 'Big deal',
        value: 1500.5,
        stage: 'NEGOTIATION',
        client: { connect: { id: 3 } },
      });
    });

    it('answers 404 and creates nothing when the client does not exist', async () => {
      clientsService.getClientForActor.mockRejectedValue(new NotFoundException('Client not found'));

      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 999 });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message', 'Client not found');
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing title', { clientId: 3 }],
      ['a too short title', { title: 'a', clientId: 3 }],
      ['a too long title', { title: 'x'.repeat(101), clientId: 3 }],
      ['a title that is not a string', { title: 5, clientId: 3 }],
      ['a zero value', { title: 'Big deal', value: 0, clientId: 3 }],
      ['a negative value', { title: 'Big deal', value: -5, clientId: 3 }],
      ['a value with three decimals', { title: 'Big deal', value: 1.234, clientId: 3 }],
      ['a value that is text', { title: 'Big deal', value: 'abc', clientId: 3 }],
      ['an unknown stage', { title: 'Big deal', stage: 'BOGUS', clientId: 3 }],
      ['a missing clientId', { title: 'Big deal' }],
      ['a zero clientId', { title: 'Big deal', clientId: 0 }],
      ['a negative clientId', { title: 'Big deal', clientId: -1 }],
      ['a fractional clientId', { title: 'Big deal', clientId: 1.5 }],
      ['a clientId that is text', { title: 'Big deal', clientId: '3' }],
      ['an unknown field', { title: 'Big deal', clientId: 3, foo: 'bar' }],
    ])('rejects %s with 400 and touches nothing', async (_label, body) => {
      const res = await request(app.getHttpServer()).post('/deals').send(body);

      expect(res.status).toBe(400);
      expect(clientsService.getClientForActor).not.toHaveBeenCalled();
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('expectedCloseDate over HTTP', () => {
    const datedDeal = () => makeDeal({ expectedCloseDate: new Date('2026-11-02T00:00:00.000Z') });
    const createdData = () => dealsRepository.create.mock.calls[0][0];
    const updatedData = () => dealsRepository.update.mock.calls[0][1];

    beforeEach(() => {
      clientsService.getClientForActor.mockResolvedValue(makeClient());
      dealsRepository.create.mockResolvedValue(datedDeal());
      dealsRepository.findById.mockResolvedValue(makeDeal());
      dealsRepository.update.mockResolvedValue(datedDeal());
    });

    it('POST stores the date as midnight UTC and answers it as YYYY-MM-DD', async () => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, expectedCloseDate: '2026-11-02' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('expectedCloseDate', '2026-11-02');
      expect(createdData().expectedCloseDate).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    });

    it('POST without the date sends nothing and answers null', async () => {
      dealsRepository.create.mockResolvedValue(makeDeal());

      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('expectedCloseDate', null);
      expect(createdData().expectedCloseDate).toBeUndefined();
    });

    it('POST with null is accepted and sends null', async () => {
      dealsRepository.create.mockResolvedValue(makeDeal());

      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, expectedCloseDate: null });

      expect(res.status).toBe(201);
      expect(createdData().expectedCloseDate).toBeNull();
    });

    it('POST accepts a date in the past', async () => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, expectedCloseDate: '2000-01-01' });

      expect(res.status).toBe(201);
      expect(createdData().expectedCloseDate).toEqual(new Date('2000-01-01T00:00:00.000Z'));
    });

    it.each<[string, unknown]>([
      ['a non-existent day', '2026-02-30'],
      ['the year 0000', '0000-01-01'],
      ['a date-time with Z', '2026-11-02T00:00:00Z'],
      ['a date-time with an offset', '2026-11-02T10:00:00+03:00'],
      ['an empty string', ''],
      ['a number', 20261102],
      ['an array', ['2026-11-02']],
      ['text', 'tomorrow'],
    ])('POST rejects %s with 400 and touches nothing', async (_label, value) => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, expectedCloseDate: value });

      expect(res.status).toBe(400);
      expect(clientsService.getClientForActor).not.toHaveBeenCalled();
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });

    it('PATCH sets the date and answers it as YYYY-MM-DD', async () => {
      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ expectedCloseDate: '2026-11-02' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('expectedCloseDate', '2026-11-02');
      expect(updatedData().expectedCloseDate).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    });

    it('PATCH with null clears the date', async () => {
      dealsRepository.update.mockResolvedValue(makeDeal());

      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ expectedCloseDate: null });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('expectedCloseDate', null);
      expect(updatedData().expectedCloseDate).toBeNull();
    });

    it('PATCH without the date leaves it unchanged', async () => {
      await request(app.getHttpServer()).patch('/deals/5').send({ title: 'New title' });

      expect(updatedData().expectedCloseDate).toBeUndefined();
    });

    it('PATCH changes only the date when only the date is sent', async () => {
      await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ expectedCloseDate: '2026-11-02' });

      const data = updatedData();
      expect(data.title).toBeUndefined();
      expect(data.value).toBeUndefined();
      expect(data.stage).toBeUndefined();
    });

    it.each<[string, unknown]>([
      ['a non-existent day', '2026-02-30'],
      ['a date-time', '2026-11-02T00:00:00.000Z'],
      ['an empty string', ''],
      ['a number', 20261102],
    ])('PATCH rejects %s with 400 and updates nothing', async (_label, value) => {
      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ expectedCloseDate: value });

      expect(res.status).toBe(400);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('GET /deals/:id shows null for a deal without a date, as every old row does', async () => {
      const res = await request(app.getHttpServer()).get('/deals/5');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('expectedCloseDate', null);
    });

    it('GET /deals/:id shows the date as YYYY-MM-DD', async () => {
      dealsRepository.findById.mockResolvedValue(datedDeal());

      const res = await request(app.getHttpServer()).get('/deals/5');

      expect(res.body).toHaveProperty('expectedCloseDate', '2026-11-02');
    });

    it('GET /deals mixes dated and undated deals, keeping the order', async () => {
      dealsRepository.findAll.mockResolvedValue([datedDeal(), makeDeal({ id: 4 })]);

      const res = await request(app.getHttpServer()).get('/deals');

      expect(res.body).toMatchObject([
        { id: 5, expectedCloseDate: '2026-11-02' },
        { id: 4, expectedCloseDate: null },
      ]);
    });
  });

  describe('stage: null over HTTP', () => {
    beforeEach(() => {
      clientsService.getClientForActor.mockResolvedValue(makeClient());
      dealsRepository.create.mockResolvedValue(makeDeal());
      dealsRepository.findById.mockResolvedValue(makeDeal());
      dealsRepository.update.mockResolvedValue(makeDeal());
    });

    it('POST rejects null with 400 and touches nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, stage: null });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message', [
        'stage must be one of the following values: NEW, QUALIFICATION, NEGOTIATION, WON, LOST',
      ]);
      expect(clientsService.getClientForActor).not.toHaveBeenCalled();
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });

    it('PATCH rejects null with 400 and touches nothing', async () => {
      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: null });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message', [
        'stage must be one of the following values: NEW, QUALIFICATION, NEGOTIATION, WON, LOST',
      ]);
      expect(dealsRepository.findById).not.toHaveBeenCalled();
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('PATCH rejects null next to valid fields and updates nothing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ title: 'New title', stage: null });

      expect(res.status).toBe(400);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it.each(Object.values(DealStage))('POST still accepts %s', async (stage) => {
      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, stage });

      expect(res.status).toBe(201);
      expect(dealsRepository.create.mock.calls[0][0]).toMatchObject({ stage });
    });

    it.each(Object.values(DealStage))('PATCH still accepts %s', async (stage) => {
      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage });

      expect(res.status).toBe(200);
      expect(dealsRepository.update.mock.calls[0][1]).toMatchObject({ stage });
    });
  });

  describe('stage transitions over HTTP', () => {
    const wonDeal = () => makeDeal({ stage: DealStage.WON });

    beforeEach(() => {
      dealsRepository.findById.mockResolvedValue(makeDeal());
      dealsRepository.update.mockResolvedValue(makeDeal());
    });

    it('answers 409 with a Conflict body for a forbidden transition', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'NEW' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'A WON deal cannot move to NEW: WON and LOST are final stages',
      });
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('answers 409 for LOST -> WON as well', async () => {
      dealsRepository.findById.mockResolvedValue(makeDeal({ stage: DealStage.LOST }));

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'WON' });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty(
        'message',
        'A LOST deal cannot move to WON: WON and LOST are final stages',
      );
    });

    it('does not update other fields when the transition is forbidden', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ title: 'New title', stage: 'NEW' });

      expect(res.status).toBe(409);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('allows a transition out of an open stage', async () => {
      dealsRepository.update.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'WON' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stage', 'WON');
      expect(dealsRepository.update.mock.calls[0][1]).toMatchObject({ stage: 'WON' });
    });

    it('allows other fields of a closed deal to change', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());
      dealsRepository.update.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer())
        .patch('/deals/5')
        .send({ title: 'New title', value: 10, expectedCloseDate: '2026-11-02' });

      expect(res.status).toBe(200);
      expect(dealsRepository.update).toHaveBeenCalledTimes(1);
    });

    it('allows a closed deal to keep its stage', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());
      dealsRepository.update.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'WON' });

      expect(res.status).toBe(200);
    });

    it('answers 400 for an unknown stage before looking at the deal', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'BOGUS' });

      expect(res.status).toBe(400);
      expect(dealsRepository.findById).not.toHaveBeenCalled();
    });

    it('answers 400 for a null stage on a closed deal', async () => {
      dealsRepository.findById.mockResolvedValue(wonDeal());

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ stage: null });

      expect(res.status).toBe(400);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('answers 404, not 409, for a missing deal', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).patch('/deals/999').send({ stage: 'NEW' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message', 'Deal not found');
    });

    it.each(Object.values(DealStage))('POST still creates a deal in %s', async (stage) => {
      clientsService.getClientForActor.mockResolvedValue(makeClient());
      dealsRepository.create.mockResolvedValue(makeDeal({ stage }));

      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Big deal', clientId: 3, stage });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /deals', () => {
    it('returns every deal in the order the repository gives, as public shapes', async () => {
      dealsRepository.findAll.mockResolvedValue([makeDeal({ id: 2 }), makeDeal({ id: 1 })]);

      const res = await request(app.getHttpServer()).get('/deals');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body).toMatchObject([{ ...publicDeal, id: 2 }, { id: 1 }]);
    });

    it('returns an empty list when there are no deals', async () => {
      dealsRepository.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer()).get('/deals');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /deals/:id', () => {
    it('returns the deal in the public shape', async () => {
      dealsRepository.findById.mockResolvedValue(makeDeal());

      const res = await request(app.getHttpServer()).get('/deals/5');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(publicDeal);
      expect(dealsRepository.findById).toHaveBeenCalledWith(5, signedInUser.sub);
    });

    it('answers 404 for a missing deal', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).get('/deals/999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message', 'Deal not found');
    });

    it('answers 400 for a non-numeric id', async () => {
      const res = await request(app.getHttpServer()).get('/deals/abc');

      expect(res.status).toBe(400);
      expect(dealsRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /deals/:id', () => {
    beforeEach(() => {
      dealsRepository.findById.mockResolvedValue(makeDeal());
      dealsRepository.update.mockResolvedValue(makeDeal({ title: 'New title' }));
    });

    it('sends only the fields that were given and returns the updated deal', async () => {
      const res = await request(app.getHttpServer()).patch('/deals/5').send({ title: 'New title' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ...publicDeal, title: 'New title' });
      const [id, data] = dealsRepository.update.mock.calls[0];
      expect(id).toBe(5);
      expect(data).toMatchObject({ title: 'New title' });
      expect(data.value).toBeUndefined();
      expect(data.stage).toBeUndefined();
    });

    it('accepts a stage change', async () => {
      await request(app.getHttpServer()).patch('/deals/5').send({ stage: 'WON' });

      expect(dealsRepository.update.mock.calls[0][1]).toMatchObject({ stage: 'WON' });
    });

    it('accepts a new value', async () => {
      await request(app.getHttpServer()).patch('/deals/5').send({ value: 2000.25 });

      expect(dealsRepository.update.mock.calls[0][1]).toMatchObject({ value: 2000.25 });
    });

    it('answers 404 and updates nothing for a missing deal', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch('/deals/999')
        .send({ title: 'New title' });

      expect(res.status).toBe(404);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('answers 400 for a non-numeric id', async () => {
      const res = await request(app.getHttpServer())
        .patch('/deals/abc')
        .send({ title: 'New title' });

      expect(res.status).toBe(400);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown>]>([
      ['a too short title', { title: 'a' }],
      ['a too long title', { title: 'x'.repeat(101) }],
      ['a zero value', { value: 0 }],
      ['a value with three decimals', { value: 1.234 }],
      ['an unknown stage', { stage: 'BOGUS' }],
      ['clientId (a deal cannot change its client)', { clientId: 4 }],
      ['an unknown field', { foo: 'bar' }],
    ])('rejects %s with 400 and updates nothing', async (_label, body) => {
      const res = await request(app.getHttpServer()).patch('/deals/5').send(body);

      expect(res.status).toBe(400);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('who sees which deals over HTTP', () => {
    it("GET /deals asks only for the deals of the manager's own clients", async () => {
      dealsRepository.findAll.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/deals');

      expect(dealsRepository.findAll).toHaveBeenCalledWith({ managerId: 7 });
    });

    it('GET /deals asks for every deal when an admin is signed in', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
      dealsRepository.findAll.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/deals');

      expect(dealsRepository.findAll).toHaveBeenCalledWith({ managerId: undefined });
    });

    it('GET /deals/:id of a client the manager is not assigned to is a 404', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).get('/deals/5');

      expect(res.status).toBe(404);
      expect(dealsRepository.findById).toHaveBeenCalledWith(5, 7);
    });

    it('GET /deals/:id lets an admin read any deal', async () => {
      signedInUser = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
      dealsRepository.findById.mockResolvedValue(makeDeal());

      const res = await request(app.getHttpServer()).get('/deals/5');

      expect(res.status).toBe(200);
      expect(dealsRepository.findById).toHaveBeenCalledWith(5, undefined);
    });

    it("PATCH /deals/:id of someone else's deal is a 404 and changes nothing", async () => {
      dealsRepository.findById.mockResolvedValue(null);

      const res = await request(app.getHttpServer()).patch('/deals/5').send({ title: 'Hacked' });

      expect(res.status).toBe(404);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('POST /deals for a client the manager cannot see is a 404 and creates nothing', async () => {
      clientsService.getClientForActor.mockRejectedValue(new NotFoundException('Client not found'));

      const res = await request(app.getHttpServer())
        .post('/deals')
        .send({ title: 'Sneaky deal', clientId: 8 });

      expect(res.status).toBe(404);
      expect(clientsService.getClientForActor).toHaveBeenCalledWith(8, signedInUser);
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });
  });
});
