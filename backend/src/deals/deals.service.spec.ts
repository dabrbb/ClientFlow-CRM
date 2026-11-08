import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, DealStage, Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsService } from 'src/clients/clients.service';
import { DealsRepository, DealWithClient } from './deals.repository';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

describe('DealsService', () => {
  let service: DealsService;

  const manager: JwtPayload = { sub: 7, email: 'manager@example.com', role: Role.MANAGER };
  const admin: JwtPayload = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };

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
    statsByStage: jest.fn<
      ReturnType<DealsRepository['statsByStage']>,
      Parameters<DealsRepository['statsByStage']>
    >(),
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

  // The DATE column comes back from Prisma as a Date at 00:00 UTC.
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

  const createDto = (overrides: Partial<CreateDealDto> = {}): CreateDealDto =>
    Object.assign(new CreateDealDto(), { title: 'Big deal', clientId: 3 }, overrides);

  const updateDto = (overrides: Partial<UpdateDealDto> = {}): UpdateDealDto =>
    Object.assign(new UpdateDealDto(), overrides);

  const createdData = () => dealsRepository.create.mock.calls[0][0];
  const updatedData = () => dealsRepository.update.mock.calls[0][1];

  beforeEach(async () => {
    jest.resetAllMocks();
    clientsService.getClientForActor.mockResolvedValue(makeClient());
    dealsRepository.create.mockResolvedValue(makeDeal());
    dealsRepository.findById.mockResolvedValue(makeDeal());
    dealsRepository.update.mockResolvedValue(makeDeal());

    const moduleRef = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: DealsRepository, useValue: dealsRepository },
        { provide: ClientsService, useValue: clientsService },
      ],
    }).compile();

    service = moduleRef.get(DealsService);
  });

  describe('createDeal', () => {
    it('checks that the client exists and creates nothing if it does not', async () => {
      clientsService.getClientForActor.mockRejectedValue(new NotFoundException('Client not found'));

      await expect(service.createDeal(createDto({ clientId: 999 }), manager)).rejects.toThrow(
        new NotFoundException('Client not found'),
      );
      expect(clientsService.getClientForActor).toHaveBeenCalledWith(999, manager);
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });

    it('builds the Prisma input from the DTO and connects the client', async () => {
      await service.createDeal(createDto({ value: 1500, stage: DealStage.NEGOTIATION }), manager);

      expect(createdData()).toEqual({
        title: 'Big deal',
        value: 1500,
        stage: DealStage.NEGOTIATION,
        client: { connect: { id: 3 } },
      });
      expect(createdData()).not.toHaveProperty('clientId');
    });

    it('turns a YYYY-MM-DD string into midnight UTC of that day', async () => {
      await service.createDeal(createDto({ expectedCloseDate: '2026-11-02' }), manager);

      expect(createdData().expectedCloseDate).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    });

    it('sends nothing for a missing date, so the column stays null', async () => {
      await service.createDeal(createDto(), manager);

      expect(createdData().expectedCloseDate).toBeUndefined();
    });

    it('sends null for an explicit null', async () => {
      await service.createDeal(createDto({ expectedCloseDate: null }), manager);

      expect(createdData().expectedCloseDate).toBeNull();
    });

    it('returns the created deal as a DealResponseDto with the date as YYYY-MM-DD', async () => {
      dealsRepository.create.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-11-02T00:00:00.000Z') }),
      );

      const result = await service.createDeal(
        createDto({ expectedCloseDate: '2026-11-02' }),
        manager,
      );

      expect(result).toBeInstanceOf(DealResponseDto);
      expect(result.expectedCloseDate).toBe('2026-11-02');
    });
  });

  describe('updateDeal', () => {
    it('answers NotFoundException and updates nothing for a missing deal', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateDeal(999, updateDto({ title: 'New title' }), manager),
      ).rejects.toThrow(new NotFoundException('Deal not found'));
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('leaves the date alone when it was not sent', async () => {
      await service.updateDeal(5, updateDto({ title: 'New title' }), manager);

      expect(updatedData()).toMatchObject({ title: 'New title' });
      expect(updatedData().expectedCloseDate).toBeUndefined();
    });

    it('clears the date when null is sent', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: null }), manager);

      expect(updatedData().expectedCloseDate).toBeNull();
    });

    it('turns a YYYY-MM-DD string into midnight UTC of that day', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: '2026-12-31' }), manager);

      expect(updatedData().expectedCloseDate).toEqual(new Date('2026-12-31T00:00:00.000Z'));
    });

    it('can change only the date', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: '2026-11-02' }), manager);

      const data = updatedData();
      expect(data.title).toBeUndefined();
      expect(data.value).toBeUndefined();
      expect(data.stage).toBeUndefined();
    });

    it('still passes title, value and stage', async () => {
      await service.updateDeal(
        5,
        updateDto({ title: 'New', value: 10, stage: DealStage.WON }),
        manager,
      );

      expect(updatedData()).toMatchObject({ title: 'New', value: 10, stage: DealStage.WON });
    });
  });

  describe('updateDeal stage transitions', () => {
    // The eight forbidden transitions, written by hand. Everything else is allowed.
    const forbidden: [DealStage, DealStage][] = [
      [DealStage.WON, DealStage.NEW],
      [DealStage.WON, DealStage.QUALIFICATION],
      [DealStage.WON, DealStage.NEGOTIATION],
      [DealStage.WON, DealStage.LOST],
      [DealStage.LOST, DealStage.NEW],
      [DealStage.LOST, DealStage.QUALIFICATION],
      [DealStage.LOST, DealStage.NEGOTIATION],
      [DealStage.LOST, DealStage.WON],
    ];
    const stages = Object.values(DealStage);
    const pairs = stages.flatMap((from) =>
      stages.map((to): [DealStage, DealStage, string, boolean] => {
        const isAllowed = !forbidden.some(([f, t]) => f === from && t === to);
        return [from, to, isAllowed ? 'allowed' : 'forbidden', isAllowed];
      }),
    );

    it('covers all 25 transitions', () => {
      expect(pairs).toHaveLength(25);
      expect(pairs.filter(([, , , isAllowed]) => !isAllowed)).toHaveLength(8);
    });

    it.each(pairs)('%s -> %s is %s', async (from, to, _label, isAllowed) => {
      dealsRepository.findById.mockResolvedValue(makeDeal({ stage: from }));
      dealsRepository.update.mockResolvedValue(makeDeal({ stage: to }));

      const result = service.updateDeal(5, updateDto({ stage: to }), manager);

      if (isAllowed) {
        await expect(result).resolves.toHaveProperty('stage', to);
        expect(dealsRepository.update).toHaveBeenCalledTimes(1);
        expect(updatedData()).toMatchObject({ stage: to });
      } else {
        await expect(result).rejects.toBeInstanceOf(ConflictException);
        expect(dealsRepository.update).not.toHaveBeenCalled();
      }
    });

    it('answers 409 and says which stages are involved', async () => {
      dealsRepository.findById.mockResolvedValue(makeDeal({ stage: DealStage.WON }));

      const result = service.updateDeal(5, updateDto({ stage: DealStage.NEW }), manager);

      await expect(result).rejects.toThrow(
        new ConflictException('A WON deal cannot move to NEW: WON and LOST are final stages'),
      );
      await expect(result).rejects.toHaveProperty('status', 409);
    });

    it('names the stages of the actual request', async () => {
      dealsRepository.findById.mockResolvedValue(makeDeal({ stage: DealStage.LOST }));

      await expect(
        service.updateDeal(5, updateDto({ stage: DealStage.WON }), manager),
      ).rejects.toThrow('A LOST deal cannot move to WON: WON and LOST are final stages');
    });

    it('reads the deal only once', async () => {
      await service.updateDeal(5, updateDto({ stage: DealStage.WON }), manager);

      expect(dealsRepository.findById).toHaveBeenCalledTimes(1);
    });

    it.each([DealStage.WON, DealStage.LOST])(
      'does not check anything when the stage is not sent: a %s deal can still be edited',
      async (stage) => {
        dealsRepository.findById.mockResolvedValue(makeDeal({ stage }));

        await service.updateDeal(
          5,
          updateDto({ title: 'New title', value: 10, expectedCloseDate: '2026-11-02' }),
          manager,
        );
        await service.updateDeal(5, updateDto({ expectedCloseDate: null }), manager);

        expect(dealsRepository.update).toHaveBeenCalledTimes(2);
        expect(dealsRepository.update.mock.calls[0][1]).toMatchObject({
          title: 'New title',
          value: 10,
        });
        expect(dealsRepository.update.mock.calls[1][1].expectedCloseDate).toBeNull();
      },
    );

    it.each([DealStage.WON, DealStage.LOST])(
      'lets a %s deal keep its stage while other fields change',
      async (stage) => {
        dealsRepository.findById.mockResolvedValue(makeDeal({ stage }));

        await service.updateDeal(5, updateDto({ title: 'New title', stage }), manager);

        expect(updatedData()).toMatchObject({ title: 'New title', stage });
      },
    );

    it('rejects the whole request when the stage change is forbidden, other fields too', async () => {
      dealsRepository.findById.mockResolvedValue(makeDeal({ stage: DealStage.WON }));

      await expect(
        service.updateDeal(5, updateDto({ title: 'New title', stage: DealStage.NEW }), manager),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('answers 404, not 409, for a deal that does not exist', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateDeal(999, updateDto({ stage: DealStage.NEW }), manager),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('createDeal stages', () => {
    it.each(Object.values(DealStage))('accepts %s as the first stage', async (stage) => {
      await service.createDeal(createDto({ stage }), manager);

      expect(createdData()).toMatchObject({ stage });
      expect(dealsRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('responses', () => {
    it('show null for a deal that has no date, as every old row will', async () => {
      const result = await service.getDealForActor(5, manager);

      expect(result.expectedCloseDate).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toHaveProperty('expectedCloseDate', null);
    });

    it('show the date as YYYY-MM-DD, never as a date-time', async () => {
      dealsRepository.findById.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-11-02T00:00:00.000Z') }),
      );

      const result = await service.getDealForActor(5, manager);

      expect(result.expectedCloseDate).toBe('2026-11-02');
      expect(JSON.parse(JSON.stringify(result))).toHaveProperty('expectedCloseDate', '2026-11-02');
    });

    it('mix dated and undated deals in the list', async () => {
      dealsRepository.findAll.mockResolvedValue([
        makeDeal({ id: 2, expectedCloseDate: new Date('2026-12-31T00:00:00.000Z') }),
        makeDeal({ id: 1 }),
      ]);

      const result = await service.getAllDeals(manager);

      expect(result.map((deal) => deal.expectedCloseDate)).toEqual(['2026-12-31', null]);
    });

    it('format the update result too', async () => {
      dealsRepository.update.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const result = await service.updateDeal(
        5,
        updateDto({ expectedCloseDate: '2026-01-01' }),
        manager,
      );

      expect(result.expectedCloseDate).toBe('2026-01-01');
    });
  });

  describe('who may see which deal', () => {
    describe('getDealForActor', () => {
      it('looks a deal up for a manager only among deals of their own clients', async () => {
        await service.getDealForActor(5, manager);

        expect(dealsRepository.findById).toHaveBeenCalledWith(5, manager.sub);
      });

      it('looks a deal up for an admin among all deals', async () => {
        await service.getDealForActor(5, admin);

        expect(dealsRepository.findById).toHaveBeenCalledWith(5, undefined);
      });

      it('reports a deal the actor cannot see as not found', async () => {
        dealsRepository.findById.mockResolvedValue(null);

        await expect(service.getDealForActor(5, manager)).rejects.toThrow(NotFoundException);
      });
    });

    describe('getAllDeals', () => {
      it('restricts a manager to deals of their own clients', async () => {
        dealsRepository.findAll.mockResolvedValue([]);

        await service.getAllDeals(manager);

        expect(dealsRepository.findAll).toHaveBeenCalledWith({ managerId: manager.sub });
      });

      it('does not restrict an admin', async () => {
        dealsRepository.findAll.mockResolvedValue([]);

        await service.getAllDeals(admin);

        expect(dealsRepository.findAll).toHaveBeenCalledWith({ managerId: undefined });
      });
    });

    describe('updateDeal', () => {
      it("finds the deal among the manager's own and updates it", async () => {
        await service.updateDeal(5, updateDto({ title: 'New' }), manager);

        expect(dealsRepository.findById).toHaveBeenCalledWith(5, manager.sub);
        expect(dealsRepository.update).toHaveBeenCalledTimes(1);
      });

      it('lets an admin update any deal', async () => {
        await service.updateDeal(5, updateDto({ title: 'New' }), admin);

        expect(dealsRepository.findById).toHaveBeenCalledWith(5, undefined);
        expect(dealsRepository.update).toHaveBeenCalledTimes(1);
      });

      it("answers 404 and changes nothing for someone else's deal", async () => {
        dealsRepository.findById.mockResolvedValue(null);

        await expect(service.updateDeal(5, updateDto({ title: 'New' }), manager)).rejects.toThrow(
          NotFoundException,
        );
        expect(dealsRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('createDeal', () => {
      it('checks the actor may see the client, and creates nothing if not', async () => {
        clientsService.getClientForActor.mockRejectedValue(
          new NotFoundException('Client not found'),
        );

        await expect(service.createDeal(createDto({ clientId: 8 }), manager)).rejects.toThrow(
          NotFoundException,
        );
        expect(clientsService.getClientForActor).toHaveBeenCalledWith(8, manager);
        expect(dealsRepository.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('getStageStats', () => {
    const stats = [{ stage: DealStage.WON, count: 2, valueSum: 300 }];

    beforeEach(() => {
      dealsRepository.statsByStage.mockResolvedValue(stats);
    });

    it('restricts a manager to the deals of their own clients', async () => {
      await expect(service.getStageStats(manager)).resolves.toBe(stats);

      expect(dealsRepository.statsByStage).toHaveBeenCalledWith({ managerId: 7 });
    });

    it('does not restrict an admin', async () => {
      await service.getStageStats(admin);

      expect(dealsRepository.statsByStage).toHaveBeenCalledWith({ managerId: undefined });
    });
  });
});
