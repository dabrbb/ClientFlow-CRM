import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type NoteWithAuthor = Prisma.NoteGetPayload<{
  include: {
    author: {
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
      };
    };
  };
}>;

const relations = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.NoteInclude;

@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.NoteCreateInput): Promise<NoteWithAuthor> {
    return this.prisma.note.create({ data, include: relations });
  }

  async findById(id: number): Promise<NoteWithAuthor | null> {
    return this.prisma.note.findUnique({ where: { id }, include: relations });
  }

  // Newest first.
  async findByDeal(dealId: number): Promise<NoteWithAuthor[]> {
    return this.prisma.note.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
      include: relations,
    });
  }

  async update(id: number, content: string): Promise<NoteWithAuthor> {
    return this.prisma.note.update({ where: { id }, data: { content }, include: relations });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.note.delete({ where: { id } });
  }
}
