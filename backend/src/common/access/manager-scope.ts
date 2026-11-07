import { Role } from '@prisma/client';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';

// Which manager's clients an actor may see: an admin sees every client (undefined = no
// restriction), a manager only the ones they are assigned to. Repositories take this as a
// neutral `managerId` filter and know nothing about roles.
export function managerScope(actor: JwtPayload): number | undefined {
  return actor.role === Role.ADMIN ? undefined : actor.sub;
}
