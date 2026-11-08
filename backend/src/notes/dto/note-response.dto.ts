import { Role } from '@prisma/client';

import { NoteWithAuthor } from '../notes.repository';

export class NoteResponseDto {
  id: number;
  content: string;
  dealId: number;
  createdAt: Date;
  updatedAt: Date;

  author: {
    id: number;
    name: string;
    email: string;
    role: Role;
  };

  constructor(note: NoteWithAuthor) {
    this.id = note.id;
    this.content = note.content;
    this.dealId = note.dealId;
    this.createdAt = note.createdAt;
    this.updatedAt = note.updatedAt;
    this.author = note.author;
  }
}
