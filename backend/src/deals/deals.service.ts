import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { managerScope } from 'src/common/access/manager-scope';
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

  // A deal belongs to a client, so only someone who may see that client may add a deal to it.
  async createDeal(dto: CreateDealDto, actor: JwtPayload): Promise<DealResponseDto> {
    await this.clientsService.getClientForActor(dto.clientId, actor);

    const deal = await this.dealsRepository.create({
      title: dto.title,
      value: dto.value,
      stage: dto.stage,
      expectedCloseDate: parseOptionalDateOnly(dto.expectedCloseDate),
      client: { connect: { id: dto.clientId } },
    });

    return new DealResponseDto(deal);
  }

  // Unrestricted lookup for internal existence checks (tasks use it for now).
  // Endpoints must use getDealForActor instead.
  async getDealById(id: number): Promise<DealResponseDto> {
    const deal = await this.dealsRepository.findById(id);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return new DealResponseDto(deal);
  }

  // A deal the actor may not see is reported as missing, so its existence is not revealed.
  async getDealForActor(id: number, actor: JwtPayload): Promise<DealResponseDto> {
    const deal = await this.dealsRepository.findById(id, managerScope(actor));

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return new DealResponseDto(deal);
  }

  async getAllDeals(actor: JwtPayload): Promise<DealResponseDto[]> {
    const deals = await this.dealsRepository.findAll({ managerId: managerScope(actor) });

    return deals.map((deal) => new DealResponseDto(deal));
  }

  async updateDeal(id: number, dto: UpdateDealDto, actor: JwtPayload): Promise<DealResponseDto> {
    const current = await this.getDealForActor(id, actor);

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
