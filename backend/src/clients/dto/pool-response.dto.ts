import { ClientStatus } from '@prisma/client';
import type { PoolClient } from '../clients.repository';

// A client nobody works with yet. Contacts stay hidden until a manager takes the client, so
// the pool cannot be used to reach clients without claiming them.
export class PoolClientDto {
  constructor(client: PoolClient) {
    this.id = client.id;
    this.name = client.name;
    this.status = client.status;
    this.createdAt = client.createdAt;
  }

  readonly id: number;
  readonly name: string;
  readonly status: ClientStatus;
  readonly createdAt: Date;
}

export class PoolResponseDto {
  readonly data: PoolClientDto[];

  readonly meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };

  constructor(clients: PoolClient[], page: number, limit: number, total: number) {
    this.data = clients.map((client) => new PoolClientDto(client));

    this.meta = {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }
}
