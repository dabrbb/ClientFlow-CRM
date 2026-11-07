import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';

describe('ClientsService', () => {
  let service: ClientsService;

  const clientsRepository = {
    create: jest.fn<Promise<Client>, Parameters<ClientsRepository['create']>>(),
    findById: jest.fn<Promise<Client | null>, Parameters<ClientsRepository['findById']>>(),
    findAll: jest.fn<Promise<Client[]>, Parameters<ClientsRepository['findAll']>>(),
    count: jest.fn<Promise<number>, Parameters<ClientsRepository['count']>>(),
    update: jest.fn<Promise<Client>, Parameters<ClientsRepository['update']>>(),
  };

  const admin: JwtPayload = { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
  const manager: JwtPayload = { sub: 7, email: 'manager@example.com', role: Role.MANAGER };

  const aClient: Client = {
    id: 5,
    name: 'Acme',
    email: null,
    phone: null,
    status: ClientStatus.LEAD,
    deletedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    userId: 1,
  };

  const makeQuery = (overrides: Partial<GetClientsQueryDto> = {}): GetClientsQueryDto =>
    Object.assign(new GetClientsQueryDto(), overrides);

  const findAllParams = () => clientsRepository.findAll.mock.calls[0][0];
  const countFilters = () => clientsRepository.count.mock.calls[0][0];

  beforeEach(async () => {
    jest.resetAllMocks();
    clientsRepository.findAll.mockResolvedValue([]);
    clientsRepository.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [ClientsService, { provide: ClientsRepository, useValue: clientsRepository }],
    }).compile();

    service = moduleRef.get(ClientsService);
  });

  describe('getAllClients: createdAfter', () => {
    it('reads a plain date as the start of that day in UTC', async () => {
      await service.getAllClients(makeQuery({ createdAfter: '2026-11-02' }), admin);

      expect(findAllParams().createdAfter?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('keeps the exact instant of a UTC date-time, with milliseconds', async () => {
      await service.getAllClients(makeQuery({ createdAfter: '2026-11-02T10:00:00.123Z' }), admin);

      expect(findAllParams().createdAfter?.toISOString()).toBe('2026-11-02T10:00:00.123Z');
    });

    it.each([
      ['2026-11-02T10:00:00+03:00', '2026-11-02T07:00:00.000Z'],
      ['2026-11-02T10:00:00-05:30', '2026-11-02T15:30:00.000Z'],
      ['2026-11-02T01:00:00+03:00', '2026-11-01T22:00:00.000Z'],
    ])('applies the offset of %s', async (input, expectedUtc) => {
      await service.getAllClients(makeQuery({ createdAfter: input }), admin);

      expect(findAllParams().createdAfter?.toISOString()).toBe(expectedUtc);
    });

    it('passes no date when createdAfter is absent', async () => {
      await service.getAllClients(makeQuery(), admin);

      expect(findAllParams().createdAfter).toBeUndefined();
      expect(countFilters().createdAfter).toBeUndefined();
    });
  });

  describe('getAllClients: list and count', () => {
    it('use the same filters', async () => {
      await service.getAllClients(
        makeQuery({
          createdAfter: '2026-11-02T10:00:00+03:00',
          search: 'alex',
          status: ClientStatus.ACTIVE,
        }),
        manager,
      );

      expect(findAllParams()).toMatchObject(countFilters());
      expect(countFilters()).toEqual({
        search: 'alex',
        status: ClientStatus.ACTIVE,
        createdAfter: new Date('2026-11-02T07:00:00.000Z'),
        managerId: manager.sub,
      });
    });

    it('count only filters, never paging or sorting', async () => {
      await service.getAllClients(
        makeQuery({ page: 3, limit: 20, sort: 'name', order: 'asc' }),
        admin,
      );

      expect(Object.keys(countFilters()).sort()).toEqual([
        'createdAfter',
        'managerId',
        'search',
        'status',
      ]);
    });
  });

  describe('getAllClients: existing parameters', () => {
    it('still reach the repository unchanged', async () => {
      await service.getAllClients(
        makeQuery({
          page: 3,
          limit: 20,
          search: 'alex',
          status: ClientStatus.LEAD,
          sort: 'name',
          order: 'asc',
          createdAfter: '2026-11-02',
        }),
        admin,
      );

      expect(findAllParams()).toEqual({
        skip: 40,
        take: 20,
        search: 'alex',
        status: ClientStatus.LEAD,
        createdAfter: new Date('2026-11-02T00:00:00.000Z'),
        managerId: undefined,
        sort: 'name',
        order: 'asc',
      });
    });

    it('use the defaults when nothing is given', async () => {
      await service.getAllClients(makeQuery(), admin);

      expect(findAllParams()).toEqual({
        skip: 0,
        take: 10,
        search: undefined,
        status: undefined,
        createdAfter: undefined,
        managerId: undefined,
        sort: 'createdAt',
        order: 'desc',
      });
    });
  });

  describe('getAllClients: who sees what', () => {
    it('restricts a manager to their own clients in both the list and the count', async () => {
      await service.getAllClients(makeQuery(), manager);

      expect(findAllParams().managerId).toBe(manager.sub);
      expect(countFilters().managerId).toBe(manager.sub);
    });

    it('does not restrict an admin', async () => {
      await service.getAllClients(makeQuery(), admin);

      expect(findAllParams().managerId).toBeUndefined();
      expect(countFilters().managerId).toBeUndefined();
    });
  });

  describe('getAllClients: response meta', () => {
    it.each([
      [95, 10, 10],
      [11, 10, 2],
      [10, 10, 1],
      [0, 10, 0],
    ])('has pages for total=%i and limit=%i', async (total, limit, pages) => {
      clientsRepository.count.mockResolvedValue(total);

      const result = await service.getAllClients(makeQuery({ page: 2, limit }), admin);

      expect(result.meta).toEqual({ page: 2, limit, total, pages });
    });

    it('no longer has totalPages', async () => {
      const result = await service.getAllClients(makeQuery(), admin);

      expect(result.meta).not.toHaveProperty('totalPages');
    });
  });

  describe('createClient', () => {
    it('stores the signed-in user as the creator and assigns nobody', async () => {
      clientsRepository.create.mockResolvedValue(aClient);
      const dto = Object.assign(new CreateClientDto(), { name: 'Acme', email: 'a@acme.com' });

      await service.createClient(dto, admin);

      expect(clientsRepository.create).toHaveBeenCalledWith({
        name: 'Acme',
        email: 'a@acme.com',
        user: { connect: { id: admin.sub } },
      });
      const data = clientsRepository.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('managers');
    });
  });

  describe('getClientForActor', () => {
    it('looks a client up for a manager only among their own', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);

      await expect(service.getClientForActor(5, manager)).resolves.toBe(aClient);
      expect(clientsRepository.findById).toHaveBeenCalledWith(5, manager.sub);
    });

    it('looks a client up for an admin among all of them', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);

      await service.getClientForActor(5, admin);

      expect(clientsRepository.findById).toHaveBeenCalledWith(5, undefined);
    });

    it('reports a client the actor cannot see as not found', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.getClientForActor(5, manager)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getClientById', () => {
    it('stays unrestricted for internal existence checks', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);

      await expect(service.getClientById(5)).resolves.toBe(aClient);
      expect(clientsRepository.findById).toHaveBeenCalledWith(5);
    });

    it('throws not found for a missing client', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.getClientById(5)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateClient', () => {
    it('updates a client the actor can see', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      clientsRepository.update.mockResolvedValue({ ...aClient, name: 'New' });

      await service.updateClient(5, { name: 'New' }, manager);

      expect(clientsRepository.findById).toHaveBeenCalledWith(5, manager.sub);
      expect(clientsRepository.update).toHaveBeenCalledWith(5, { name: 'New' });
    });

    it('does not touch a client the actor cannot see', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.updateClient(5, { name: 'New' }, manager)).rejects.toThrow(
        NotFoundException,
      );
      expect(clientsRepository.update).not.toHaveBeenCalled();
    });
  });
});
