import { IsInt, IsOptional, Min } from 'class-validator';

export class MoveNoteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
