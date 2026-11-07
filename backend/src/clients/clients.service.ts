import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { UsersService } from 'src/users/users.service';
import { Client, Prisma } from '@prisma/client';
import { managerScope } from 'src/common/access/manager-scope';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientResponseDto } from './dto/clients-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { GetPoolQueryDto } from './dto/get-pool-query.dto';
import { PoolResponseDto } from './dto/pool-response.dto';
import { ClientManagerResponseDto } from './dto/client-manager-response.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly usersService: UsersService,
  ) {}

  // The creator is stored for the record only: the client lands in the pool until a manager
  // is assigned, so no ClientManager row is created here.
  async createClient(dto: CreateClientDto, actor: JwtPayload): Promise<Client> {
    return this.clientsRepository.create({
      ...dto,
      user: { connect: { id: actor.sub } },
    });
  }

  // A client the actor may not see is reported as missing, so its existence is not revealed.
  async getClientForActor(id: number, actor: JwtPayload): Promise<Client> {
    const client = await this.clientsRepository.findById(id, managerScope(actor));

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async getAllClients(query: GetClientsQueryDto, actor: JwtPayload): Promise<ClientResponseDto> {
    const { page, limit, search, status, createdAfter, sort, order } = query;

    const skip = (page - 1) * limit;

    const filters = {
      search,
      status,
      // Date-only strings parse as UTC midnight; the DTO guarantees every date-time has Z/offset.
      createdAfter: createdAfter ? new Date(createdAfter) : undefined,
      managerId: managerScope(actor),
    };

    const [clients, total] = await Promise.all([
      this.clientsRepository.findAll({
        ...filters,
        skip,
        take: limit,
        sort,
        order,
      }),
      this.clientsRepository.count(filters),
    ]);

    return new ClientResponseDto(clients, page, limit, total);
  }

  async updateClient(
    id: number,
    data: Prisma.ClientUpdateInput,
    actor: JwtPayload,
  ): Promise<Client> {
    await this.getClientForActor(id, actor);

    return this.clientsRepository.update(id, data);
  }

  // Whether a user is one of the client's managers. Used to check who a task may be given to.
  async isAssigned(clientId: number, userId: number): Promise<boolean> {
    return this.clientsRepository.isAssigned(clientId, userId);
  }

  async getPool(query: GetPoolQueryDto): Promise<PoolResponseDto> {
    const { page, limit } = query;

    const [clients, total] = await Promise.all([
      this.clientsRepository.findPool({ skip: (page - 1) * limit, take: limit }),
      this.clientsRepository.countPool(),
    ]);

    return new PoolResponseDto(clients, page, limit, total);
  }

  async claimClient(id: number, actor: JwtPayload): Promise<Client> {
    const result = await this.clientsRepository.claim(id, actor.sub);

    if (result === 'not_found') {
      throw new NotFoundException('Client not found');
    }

    if (result === 'taken') {
      throw new ConflictException('This client is already assigned to a manager');
    }

    return this.getClientForActor(id, actor);
  }

  async getManagers(clientId: number, actor: JwtPayload): Promise<ClientManagerResponseDto[]> {
    await this.getClientForActor(clientId, actor);

    const links = await this.clientsRepository.findManagers(clientId);

    return links.map((link) => new ClientManagerResponseDto(link));
  }

  // Any assigned manager (or an admin) may add anyone, an admin included. No consent step:
  // colleagues agree outside the system.
  async addManager(
    clientId: number,
    userId: number,
    actor: JwtPayload,
  ): Promise<ClientManagerResponseDto> {
    await this.getClientForActor(clientId, actor);
    await this.usersService.getUserById(userId);

    const link = await this.clientsRepository.addManager(clientId, userId, actor.sub);

    if (!link) {
      throw new ConflictException('This user is already assigned to the client');
    }

    return new ClientManagerResponseDto(link);
  }

  // A manager may remove themselves or a colleague. When the last one goes, the client returns
  // to the pool. Open tasks must be handed over first, otherwise they would stay with someone who
  // can no longer see them; closed ones (DONE, CANCELLED) do not count.
  async removeManager(clientId: number, userId: number, actor: JwtPayload): Promise<void> {
    await this.getClientForActor(clientId, actor);

    if (!(await this.clientsRepository.isAssigned(clientId, userId))) {
      throw new NotFoundException('This user is not assigned to the client');
    }

    const openTasks = await this.clientsRepository.countOpenTasks(clientId, userId);

    if (openTasks > 0) {
      throw new ConflictException(
        `This manager still has ${openTasks} open task(s) on this client. ` +
          'Hand them to another manager or close them first',
      );
    }

    await this.clientsRepository.removeManager(clientId, userId);
  }
}
