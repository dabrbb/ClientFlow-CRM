import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { Client, Prisma } from '@prisma/client';

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

  async getAllClients(): Promise<Client[]> {
    return this.clientsRepository.findAll();
  }

  async updateClient(id: number, data: Prisma.ClientUpdateInput): Promise<Client> {
    await this.getClientById(id);

    return this.clientsRepository.update(id, data);
  }
}
