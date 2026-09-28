import { Client, ClientStatus } from '@prisma/client';

export class ClientShortDto {
  readonly id: number;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: ClientStatus;

  constructor(client: Client) {
    this.id = client.id;
    this.name = client.name;
    this.email = client.email;
    this.phone = client.phone;
    this.status = client.status;
  }
}
