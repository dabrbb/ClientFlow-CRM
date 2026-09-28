import { Injectable, NotFoundException } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { Deal, Prisma } from '@prisma/client';
import { ClientsService } from 'src/clients/clients.service';
import { DealResponseDto } from './dto/deal-response.dto';

@Injectable()
export class DealsService {
  constructor(
    private readonly dealsRepository: DealsRepository,
    private readonly clientsService: ClientsService,
  ) {}

  async createDeal(data: Prisma.DealCreateInput, clientId: number): Promise<DealResponseDto> {
    await this.clientsService.getClientById(clientId);

    const deal = await this.dealsRepository.create(data);

    return new DealResponseDto(deal);
  }

  async getDealById(id: number): Promise<DealResponseDto> {
    const deal = await this.dealsRepository.findById(id);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return new DealResponseDto(deal);
  }

  async getAllDeals(): Promise<DealResponseDto[]> {
    const deals = await this.dealsRepository.findAll();

    return deals.map((deal) => new DealResponseDto(deal));
  }

  async updateDeal(id: number, data: Prisma.DealUpdateInput): Promise<DealResponseDto> {
    await this.getDealById(id);

    const deal = await this.dealsRepository.update(id, data);

    return new DealResponseDto(deal);
  }
}
