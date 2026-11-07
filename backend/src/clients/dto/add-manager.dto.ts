import { IsInt, IsPositive } from 'class-validator';

export class AddManagerDto {
  @IsInt()
  @IsPositive()
  userId!: number;
}
