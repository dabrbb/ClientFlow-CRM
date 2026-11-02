import { Test } from '@nestjs/testing';
import { Client, ClientStatus } from '@prisma/client';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';

describe('ClientsService.getAllClients', () => {
  let service: ClientsService;

  const clientsRepository = {
    findAll: jest.fn<Promise<Client[]>, Parameters<ClientsRepository['findAll']>>(),
    count: jest.fn<Promise<number>, Parameters<ClientsRepository['count']>>(),
  };

  const makeQuery = (overrides: Partial<GetClientsQueryDto> = {}): GetClientsQueryDto =>
    Object.assign(new GetClientsQueryDto(), overrides);

  const findAllParams = () => clientsRepository.findAll.mock.calls[0][0];
  const countFilters = () => clientsRepository.count.mock.calls[0][0];

  beforeEach(async () => {
    jest.clearAllMocks();
    clientsRepository.findAll.mockResolvedValue([]);
    clientsRepository.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [ClientsService, { provide: ClientsRepository, useValue: clientsRepository }],
    }).compile();

    service = moduleRef.get(ClientsService);
  });

  describe('createdAfter', () => {
    it('reads a plain date as the start of that day in UTC', async () => {
      await service.getAllClients(makeQuery({ createdAfter: '2026-11-02' }));

      expect(findAllParams().createdAfter?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('keeps the exact instant of a UTC date-time, with milliseconds', async () => {
      await service.getAllClients(makeQuery({ createdAfter: '2026-11-02T10:00:00.123Z' }));

      expect(findAllParams().createdAfter?.toISOString()).toBe('2026-11-02T10:00:00.123Z');
    });

    it.each([
      ['2026-11-02T10:00:00+03:00', '2026-11-02T07:00:00.000Z'],
      ['2026-11-02T10:00:00-05:30', '2026-11-02T15:30:00.000Z'],
      ['2026-11-02T01:00:00+03:00', '2026-11-01T22:00:00.000Z'],
    ])('applies the offset of %s', async (input, expectedUtc) => {
      await service.getAllClients(makeQuery({ createdAfter: input }));

      expect(findAllParams().createdAfter?.toISOString()).toBe(expectedUtc);
    });

    it('passes no date when createdAfter is absent', async () => {
      await service.getAllClients(makeQuery());

      expect(findAllParams().createdAfter).toBeUndefined();
      expect(countFilters().createdAfter).toBeUndefined();
    });
  });

  describe('list and count', () => {
    it('use the same filters', async () => {
      await service.getAllClients(
        makeQuery({
          createdAfter: '2026-11-02T10:00:00+03:00',
          search: 'alex',
          status: ClientStatus.ACTIVE,
        }),
      );

      expect(findAllParams()).toMatchObject(countFilters());
      expect(countFilters()).toEqual({
        search: 'alex',
        status: ClientStatus.ACTIVE,
        createdAfter: new Date('2026-11-02T07:00:00.000Z'),
      });
    });

    it('count only filters, never paging or sorting', async () => {
      await service.getAllClients(makeQuery({ page: 3, limit: 20, sort: 'name', order: 'asc' }));

      expect(Object.keys(countFilters()).sort()).toEqual(['createdAfter', 'search', 'status']);
    });
  });

  describe('existing parameters', () => {
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
      );

      expect(findAllParams()).toEqual({
        skip: 40,
        take: 20,
        search: 'alex',
        status: ClientStatus.LEAD,
        createdAfter: new Date('2026-11-02T00:00:00.000Z'),
        sort: 'name',
        order: 'asc',
      });
    });

    it('use the defaults when nothing is given', async () => {
      await service.getAllClients(makeQuery());

      expect(findAllParams()).toEqual({
        skip: 0,
        take: 10,
        search: undefined,
        status: undefined,
        createdAfter: undefined,
        sort: 'createdAt',
        order: 'desc',
      });
    });
  });

  describe('response meta', () => {
    it.each([
      [95, 10, 10],
      [11, 10, 2],
      [10, 10, 1],
      [0, 10, 0],
    ])('has pages for total=%i and limit=%i', async (total, limit, pages) => {
      clientsRepository.count.mockResolvedValue(total);

      const result = await service.getAllClients(makeQuery({ page: 2, limit }));

      expect(result.meta).toEqual({ page: 2, limit, total, pages });
    });

    it('no longer has totalPages', async () => {
      const result = await service.getAllClients(makeQuery());

      expect(result.meta).not.toHaveProperty('totalPages');
    });
  });
});
