import { Role } from '@prisma/client';
import type { Colleague } from '../users.repository';

// The only user fields a manager may see about a coworker.
export class ColleagueResponseDto {
  constructor(colleague: Colleague) {
    this.id = colleague.id;
    this.name = colleague.name;
    this.role = colleague.role;
  }

  readonly id: number;
  readonly name: string;
  readonly role: Role;
}
