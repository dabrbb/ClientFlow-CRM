import { Role } from '@prisma/client';
import { managerScope } from './manager-scope';

describe('managerScope', () => {
  it('is unrestricted for an admin', () => {
    expect(managerScope({ sub: 1, email: 'a@example.com', role: Role.ADMIN })).toBeUndefined();
  });

  it("is the manager's own id for a manager", () => {
    expect(managerScope({ sub: 7, email: 'm@example.com', role: Role.MANAGER })).toBe(7);
  });

  it('keeps a falsy-looking id as a real restriction', () => {
    expect(managerScope({ sub: 0, email: 'm@example.com', role: Role.MANAGER })).toBe(0);
  });
});
