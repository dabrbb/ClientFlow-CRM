import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { Client, Prisma, Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientResponseDto } from './dto/clients-response.dto';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly clientsRepository: ClientsRepository) {}

  // An admin sees every client; a manager only the ones they are assigned to.
  // undefined means "no restriction" for the repository.
  private visibleTo(actor: JwtPayload): number | undefined {
    return actor.role === Role.ADMIN ? undefined : actor.sub;
  }

  // The creator is stored for the record only: the client lands in the pool until a manager
  // is assigned, so no ClientManager row is created here.
  async createClient(dto: CreateClientDto, actor: JwtPayload): Promise<Client> {
    return this.clientsRepository.create({
      ...dto,
      user: { connect: { id: actor.sub } },
    });
  }

  // Unrestricted lookup for internal checks that a client exists (deals use it for now).
  // Endpoints must use getClientForActor instead.
  async getClientById(id: number): Promise<Client | null> {
    const client = await this.clientsRepository.findById(id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  // A client the actor may not see is reported as missing, so its existence is not revealed.
  async getClientForActor(id: number, actor: JwtPayload): Promise<Client> {
    const client = await this.clientsRepository.findById(id, this.visibleTo(actor));

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
      managerId: this.visibleTo(actor),
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
}
