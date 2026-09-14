import { Role, User } from '@prisma/client';

export class UserResponseDto {
  constructor(user: User) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.role = user.role;
    this.createdAt = user.createdAt;
  }

  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly createdAt: Date;
}
