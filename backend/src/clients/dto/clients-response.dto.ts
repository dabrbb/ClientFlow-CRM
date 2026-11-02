import { Client } from '@prisma/client';

export class ClientResponseDto {
  readonly data: Client[];

  readonly meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };

  constructor(clients: Client[], page: number, limit: number, total: number) {
    this.data = clients;

    this.meta = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }
}
