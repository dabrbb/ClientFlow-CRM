import { Role } from '@prisma/client';
import type { ClientManagerWithUser } from '../clients.repository';

export class ClientManagerResponseDto {
  constructor(link: ClientManagerWithUser) {
    this.id = link.user.id;
    this.name = link.user.name;
    this.role = link.user.role;
    this.assignedAt = link.assignedAt;
  }

  readonly id: number;
  readonly name: string;
  readonly role: Role;
  readonly assignedAt: Date;
}
