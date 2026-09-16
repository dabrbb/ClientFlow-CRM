import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { Client, Prisma } from '@prisma/client';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientResponseDto } from './dto/clients-response.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly clientsRepository: ClientsRepository) {}

  async createClient(data: Prisma.ClientCreateInput): Promise<Client> {
    return this.clientsRepository.create(data);
  }

  async getClientById(id: number): Promise<Client | null> {
    const client = await this.clientsRepository.findById(id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async getAllClients(query: GetClientsQueryDto): Promise<ClientResponseDto> {
    const { page, limit, search, status, sort, order } = query;

    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      this.clientsRepository.findAll({
        skip,
        take: limit,
        search,
        status,
        sort,
        order,
      }),
      this.clientsRepository.count(search, status),
    ]);

    return new ClientResponseDto(clients, page, limit, total);
  }

  async updateClient(id: number, data: Prisma.ClientUpdateInput): Promise<Client> {
    await this.getClientById(id);

    return this.clientsRepository.update(id, data);
  }
}
