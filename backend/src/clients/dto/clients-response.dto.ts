import { Client } from '@prisma/client';

export class ClientResponseDto {
  readonly data: Client[];

  readonly meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(clients: Client[], page: number, limit: number, total: number) {
    this.data = clients;

    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
