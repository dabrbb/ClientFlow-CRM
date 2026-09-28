import { Client, Deal, DealStage } from '@prisma/client';
import { ClientShortDto } from './client-short.dto';
import { DealWithClient } from '../deals.repository';

export class DealResponseDto {
  readonly id: number;
  readonly title: string;
  readonly value: number | null;
  readonly stage: DealStage;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  readonly client: ClientShortDto;

  constructor(deal: DealWithClient) {
    this.id = deal.id;
    this.title = deal.title;
    this.value = deal.value;
    this.stage = deal.stage;
    this.createdAt = deal.createdAt;
    this.updatedAt = deal.updatedAt;

    this.client = new ClientShortDto(deal.client);
  }
}
