import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, ClientStatus, Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { UsersService } from 'src/users/users.service';
import { ClientManagerWithUser, ClientsRepository, PoolClient } from './clients.repository';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { GetPoolQueryDto } from './dto/get-pool-query.dto';

describe('ClientsService', () => {
  let service: ClientsService;

  const clientsRepository = {
    create: jest.fn<Promise<Client>, Parameters<ClientsRepository['create']>>(),
    findById: jest.fn<Promise<Client | null>, Parameters<ClientsRepository['findById']>>(),
    findAll: jest.fn<Promise<Client[]>, Parameters<ClientsRepository['findAll']>>(),
    count: jest.fn<Promise<number>, Parameters<ClientsRepository['count']>>(),
    update: jest.fn<Promise<Client>, Parameters<ClientsRepository['update']>>(),
    findPool: jest.fn<Promise<PoolClient[]>, Parameters<ClientsRepository['findPool']>>(),
    countPool: jest.fn<Promise<number>, Parameters<ClientsRepository['countPool']>>(),
    claim: jest.fn<
      ReturnType<ClientsRepository['claim']>,
      Parameters<ClientsRepository['claim']>
    >(),
    findManagers: jest.fn<
      Promise<ClientManagerWithUser[]>,
      Parameters<ClientsRepository['findManagers']>
    >(),
    addManager: jest.fn<
      Promise<ClientManagerWithUser | null>,
      Parameters<ClientsRepository['addManager']>
    >(),
    removeManager: jest.fn<Promise<boolean>, Parameters<ClientsRepository['removeManager']>>(),
    isAssigned: jest.fn<Promise<boolean>, Parameters<ClientsRepository['isAssigned']>>(),
    countOpenTasks: jest.fn<Promise<number>, Parameters<ClientsRepository['countOpenTasks']>>(),
  };

  const usersService = {
    getUserById: jest.fn<ReturnType<UsersService['getUserById']>, [number]>(),
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
      providers: [
        ClientsService,
        { provide: ClientsRepository, useValue: clientsRepository },
        { provide: UsersService, useValue: usersService },
      ],
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
        'assignedTo',
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

  const link = (userId: number, name = 'Colleague'): ClientManagerWithUser => ({
    clientId: 5,
    userId,
    assignedAt: new Date(0),
    assignedById: 1,
    user: { id: userId, name, role: Role.MANAGER },
  });

  describe('getPool', () => {
    const makeQuery = (page = 1, limit = 10) =>
      Object.assign(new GetPoolQueryDto(), { page, limit });

    it('reads the requested page and builds the meta', async () => {
      clientsRepository.findPool.mockResolvedValue([]);
      clientsRepository.countPool.mockResolvedValue(25);

      const result = await service.getPool(makeQuery(3, 10));

      expect(clientsRepository.findPool).toHaveBeenCalledWith({ skip: 20, take: 10 });
      expect(result.meta).toEqual({ page: 3, limit: 10, total: 25, pages: 3 });
    });

    it('returns only id, name, status and createdAt, never contacts', async () => {
      const row = {
        id: 5,
        name: 'Acme',
        status: ClientStatus.LEAD,
        createdAt: new Date(0),
        email: 'secret@acme.com',
        phone: '+100',
      } as PoolClient;
      clientsRepository.findPool.mockResolvedValue([row]);
      clientsRepository.countPool.mockResolvedValue(1);

      const result = await service.getPool(makeQuery());

      expect(Object.keys(result.data[0]).sort()).toEqual(['createdAt', 'id', 'name', 'status']);
    });
  });

  describe('claimClient', () => {
    it('assigns the client to the caller and returns it', async () => {
      clientsRepository.claim.mockResolvedValue('claimed');
      clientsRepository.findById.mockResolvedValue(aClient);

      await expect(service.claimClient(5, manager)).resolves.toBe(aClient);
      expect(clientsRepository.claim).toHaveBeenCalledWith(5, manager.sub);
      expect(clientsRepository.findById).toHaveBeenCalledWith(5, manager.sub);
    });

    it('answers 409 when somebody already took the client', async () => {
      clientsRepository.claim.mockResolvedValue('taken');

      await expect(service.claimClient(5, manager)).rejects.toThrow(ConflictException);
    });

    it('answers 404 for a client that does not exist', async () => {
      clientsRepository.claim.mockResolvedValue('not_found');

      await expect(service.claimClient(5, manager)).rejects.toThrow(NotFoundException);
    });

    it('lets an admin claim too', async () => {
      clientsRepository.claim.mockResolvedValue('claimed');
      clientsRepository.findById.mockResolvedValue(aClient);

      await service.claimClient(5, admin);

      expect(clientsRepository.claim).toHaveBeenCalledWith(5, admin.sub);
    });
  });

  describe('getManagers', () => {
    it('lists the managers of a client the actor can see, without extra user fields', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      clientsRepository.findManagers.mockResolvedValue([link(7, 'Me'), link(9, 'Zed')]);

      const result = await service.getManagers(5, manager);

      expect(result).toEqual([
        { id: 7, name: 'Me', role: Role.MANAGER, assignedAt: new Date(0) },
        { id: 9, name: 'Zed', role: Role.MANAGER, assignedAt: new Date(0) },
      ]);
    });

    it('hides the list of a client the actor cannot see', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.getManagers(5, manager)).rejects.toThrow(NotFoundException);
      expect(clientsRepository.findManagers).not.toHaveBeenCalled();
    });
  });

  describe('addManager', () => {
    it('adds any existing user and records who added them', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      usersService.getUserById.mockResolvedValue({} as never);
      clientsRepository.addManager.mockResolvedValue(link(9, 'Zed'));

      const result = await service.addManager(5, 9, manager);

      expect(clientsRepository.addManager).toHaveBeenCalledWith(5, 9, manager.sub);
      expect(result).toEqual({ id: 9, name: 'Zed', role: Role.MANAGER, assignedAt: new Date(0) });
    });

    it('lets an admin add a manager to any client', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      usersService.getUserById.mockResolvedValue({} as never);
      clientsRepository.addManager.mockResolvedValue(link(9));

      await service.addManager(5, 9, admin);

      expect(clientsRepository.findById).toHaveBeenCalledWith(5, undefined);
    });

    it('answers 404 and changes nothing when the actor cannot see the client', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.addManager(5, 9, manager)).rejects.toThrow(NotFoundException);
      expect(usersService.getUserById).not.toHaveBeenCalled();
      expect(clientsRepository.addManager).not.toHaveBeenCalled();
    });

    it('answers 404 for a user that does not exist', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      usersService.getUserById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(service.addManager(5, 999, manager)).rejects.toThrow(NotFoundException);
      expect(clientsRepository.addManager).not.toHaveBeenCalled();
    });

    it('answers 409 when the user is already assigned', async () => {
      clientsRepository.findById.mockResolvedValue(aClient);
      usersService.getUserById.mockResolvedValue({} as never);
      clientsRepository.addManager.mockResolvedValue(null);

      await expect(service.addManager(5, 9, manager)).rejects.toThrow(ConflictException);
    });
  });

  describe('removeManager', () => {
    beforeEach(() => {
      clientsRepository.findById.mockResolvedValue(aClient);
      clientsRepository.isAssigned.mockResolvedValue(true);
      clientsRepository.countOpenTasks.mockResolvedValue(0);
      clientsRepository.removeManager.mockResolvedValue(true);
    });

    it('lets a manager remove a colleague who has no open tasks', async () => {
      await expect(service.removeManager(5, 9, manager)).resolves.toBeUndefined();

      expect(clientsRepository.countOpenTasks).toHaveBeenCalledWith(5, 9);
      expect(clientsRepository.removeManager).toHaveBeenCalledWith(5, 9);
    });

    it('lets a manager remove themselves', async () => {
      await service.removeManager(5, manager.sub, manager);

      expect(clientsRepository.removeManager).toHaveBeenCalledWith(5, manager.sub);
    });

    it('answers 409 with the number of open tasks and removes nobody', async () => {
      clientsRepository.countOpenTasks.mockResolvedValue(3);

      await expect(service.removeManager(5, 9, manager)).rejects.toThrow(ConflictException);
      await expect(service.removeManager(5, 9, manager)).rejects.toThrow(/3 open task/);
      expect(clientsRepository.removeManager).not.toHaveBeenCalled();
    });

    it('applies the same rule when a manager removes themselves', async () => {
      clientsRepository.countOpenTasks.mockResolvedValue(1);

      await expect(service.removeManager(5, manager.sub, manager)).rejects.toThrow(
        ConflictException,
      );
      expect(clientsRepository.removeManager).not.toHaveBeenCalled();
    });

    it('applies the same rule when an admin removes a manager', async () => {
      clientsRepository.countOpenTasks.mockResolvedValue(2);

      await expect(service.removeManager(5, 9, admin)).rejects.toThrow(ConflictException);
      expect(clientsRepository.removeManager).not.toHaveBeenCalled();
    });

    it('applies the same rule to the last manager, so the client cannot return to the pool with open tasks', async () => {
      clientsRepository.countOpenTasks.mockResolvedValue(1);
      clientsRepository.findManagers.mockResolvedValue([link(9)]);

      await expect(service.removeManager(5, 9, manager)).rejects.toThrow(ConflictException);
    });

    it('answers 404, without counting tasks, when that user is not assigned', async () => {
      clientsRepository.isAssigned.mockResolvedValue(false);

      await expect(service.removeManager(5, 9, manager)).rejects.toThrow(NotFoundException);
      expect(clientsRepository.countOpenTasks).not.toHaveBeenCalled();
      expect(clientsRepository.removeManager).not.toHaveBeenCalled();
    });

    it('answers 404 and changes nothing when the actor cannot see the client', async () => {
      clientsRepository.findById.mockResolvedValue(null);

      await expect(service.removeManager(5, 9, manager)).rejects.toThrow(NotFoundException);
      expect(clientsRepository.isAssigned).not.toHaveBeenCalled();
      expect(clientsRepository.removeManager).not.toHaveBeenCalled();
    });
  });
  describe('isAssigned', () => {
    it.each([true, false])('relays %s from the repository', async (answer) => {
      clientsRepository.isAssigned.mockResolvedValue(answer);

      await expect(service.isAssigned(5, 9)).resolves.toBe(answer);
      expect(clientsRepository.isAssigned).toHaveBeenCalledWith(5, 9);
    });
  });
  describe('getAllClients: the managerId filter', () => {
    it('is passed on as assignedTo, next to the visibility scope, for the list and the count', async () => {
      await service.getAllClients(makeQuery({ managerId: 9 }), manager);

      expect(findAllParams()).toMatchObject({ managerId: manager.sub, assignedTo: 9 });
      expect(countFilters()).toMatchObject({ managerId: manager.sub, assignedTo: 9 });
    });

    it('does not replace the scope: a manager asking for themselves is still scoped', async () => {
      await service.getAllClients(makeQuery({ managerId: manager.sub }), manager);

      expect(countFilters()).toMatchObject({ managerId: manager.sub, assignedTo: manager.sub });
    });

    it('lets an admin filter by any manager without a scope', async () => {
      await service.getAllClients(makeQuery({ managerId: 9 }), admin);

      expect(countFilters().managerId).toBeUndefined();
      expect(countFilters().assignedTo).toBe(9);
    });

    it('sends nothing when the parameter is absent', async () => {
      await service.getAllClients(makeQuery(), manager);

      expect(findAllParams().assignedTo).toBeUndefined();
      expect(countFilters().assignedTo).toBeUndefined();
    });
  });
});
