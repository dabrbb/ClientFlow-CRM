import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, DealStage } from '@prisma/client';
import { ClientsService } from 'src/clients/clients.service';
import { DealsRepository, DealWithClient } from './deals.repository';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

describe('DealsService', () => {
  let service: DealsService;

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
    getClientById: jest.fn<
      ReturnType<ClientsService['getClientById']>,
      Parameters<ClientsService['getClientById']>
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
    clientsService.getClientById.mockResolvedValue(makeClient());
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
      clientsService.getClientById.mockRejectedValue(new NotFoundException('Client not found'));

      await expect(service.createDeal(createDto({ clientId: 999 }))).rejects.toThrow(
        new NotFoundException('Client not found'),
      );
      expect(clientsService.getClientById).toHaveBeenCalledWith(999);
      expect(dealsRepository.create).not.toHaveBeenCalled();
    });

    it('builds the Prisma input from the DTO and connects the client', async () => {
      await service.createDeal(createDto({ value: 1500, stage: DealStage.NEGOTIATION }));

      expect(createdData()).toEqual({
        title: 'Big deal',
        value: 1500,
        stage: DealStage.NEGOTIATION,
        client: { connect: { id: 3 } },
      });
      expect(createdData()).not.toHaveProperty('clientId');
    });

    it('turns a YYYY-MM-DD string into midnight UTC of that day', async () => {
      await service.createDeal(createDto({ expectedCloseDate: '2026-11-02' }));

      expect(createdData().expectedCloseDate).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    });

    it('sends nothing for a missing date, so the column stays null', async () => {
      await service.createDeal(createDto());

      expect(createdData().expectedCloseDate).toBeUndefined();
    });

    it('sends null for an explicit null', async () => {
      await service.createDeal(createDto({ expectedCloseDate: null }));

      expect(createdData().expectedCloseDate).toBeNull();
    });

    it('returns the created deal as a DealResponseDto with the date as YYYY-MM-DD', async () => {
      dealsRepository.create.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-11-02T00:00:00.000Z') }),
      );

      const result = await service.createDeal(createDto({ expectedCloseDate: '2026-11-02' }));

      expect(result).toBeInstanceOf(DealResponseDto);
      expect(result.expectedCloseDate).toBe('2026-11-02');
    });
  });

  describe('updateDeal', () => {
    it('answers NotFoundException and updates nothing for a missing deal', async () => {
      dealsRepository.findById.mockResolvedValue(null);

      await expect(service.updateDeal(999, updateDto({ title: 'New title' }))).rejects.toThrow(
        new NotFoundException('Deal not found'),
      );
      expect(dealsRepository.update).not.toHaveBeenCalled();
    });

    it('leaves the date alone when it was not sent', async () => {
      await service.updateDeal(5, updateDto({ title: 'New title' }));

      expect(updatedData()).toMatchObject({ title: 'New title' });
      expect(updatedData().expectedCloseDate).toBeUndefined();
    });

    it('clears the date when null is sent', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: null }));

      expect(updatedData().expectedCloseDate).toBeNull();
    });

    it('turns a YYYY-MM-DD string into midnight UTC of that day', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: '2026-12-31' }));

      expect(updatedData().expectedCloseDate).toEqual(new Date('2026-12-31T00:00:00.000Z'));
    });

    it('can change only the date', async () => {
      await service.updateDeal(5, updateDto({ expectedCloseDate: '2026-11-02' }));

      const data = updatedData();
      expect(data.title).toBeUndefined();
      expect(data.value).toBeUndefined();
      expect(data.stage).toBeUndefined();
    });

    it('still passes title, value and stage', async () => {
      await service.updateDeal(5, updateDto({ title: 'New', value: 10, stage: DealStage.WON }));

      expect(updatedData()).toMatchObject({ title: 'New', value: 10, stage: DealStage.WON });
    });
  });

  describe('responses', () => {
    it('show null for a deal that has no date, as every old row will', async () => {
      const result = await service.getDealById(5);

      expect(result.expectedCloseDate).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toHaveProperty('expectedCloseDate', null);
    });

    it('show the date as YYYY-MM-DD, never as a date-time', async () => {
      dealsRepository.findById.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-11-02T00:00:00.000Z') }),
      );

      const result = await service.getDealById(5);

      expect(result.expectedCloseDate).toBe('2026-11-02');
      expect(JSON.parse(JSON.stringify(result))).toHaveProperty('expectedCloseDate', '2026-11-02');
    });

    it('mix dated and undated deals in the list', async () => {
      dealsRepository.findAll.mockResolvedValue([
        makeDeal({ id: 2, expectedCloseDate: new Date('2026-12-31T00:00:00.000Z') }),
        makeDeal({ id: 1 }),
      ]);

      const result = await service.getAllDeals();

      expect(result.map((deal) => deal.expectedCloseDate)).toEqual(['2026-12-31', null]);
    });

    it('format the update result too', async () => {
      dealsRepository.update.mockResolvedValue(
        makeDeal({ expectedCloseDate: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const result = await service.updateDeal(5, updateDto({ expectedCloseDate: '2026-01-01' }));

      expect(result.expectedCloseDate).toBe('2026-01-01');
    });
  });
});
