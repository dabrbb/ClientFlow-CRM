import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { Prisma } from '@prisma/client';
import { ClientsService } from 'src/clients/clients.service';
import { DealResponseDto } from './dto/deal-response.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { parseOptionalDateOnly } from './date-only';
import { canChangeStage } from './deal-stage';

@Injectable()
export class DealsService {
  constructor(
    private readonly dealsRepository: DealsRepository,
    private readonly clientsService: ClientsService,
  ) {}

  async createDeal(dto: CreateDealDto): Promise<DealResponseDto> {
    await this.clientsService.getClientById(dto.clientId);

    const deal = await this.dealsRepository.create({
      title: dto.title,
      value: dto.value,
      stage: dto.stage,
      expectedCloseDate: parseOptionalDateOnly(dto.expectedCloseDate),
      client: { connect: { id: dto.clientId } },
    });

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

  async updateDeal(id: number, dto: UpdateDealDto): Promise<DealResponseDto> {
    const current = await this.getDealById(id);

    if (dto.stage !== undefined && !canChangeStage(current.stage, dto.stage)) {
      throw new ConflictException(
        `A ${current.stage} deal cannot move to ${dto.stage}: WON and LOST are final stages`,
      );
    }

    const data: Prisma.DealUpdateInput = {
      ...dto,
      expectedCloseDate: parseOptionalDateOnly(dto.expectedCloseDate),
    };

    const deal = await this.dealsRepository.update(id, data);

    return new DealResponseDto(deal);
  }
}
