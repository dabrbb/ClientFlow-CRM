import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

// Used for both create and update: a note has only one editable field, and it is required.
export class NoteContentDto {
  // Trimmed before validation, so a whitespace-only note is rejected.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 5000)
  content!: string;
}
