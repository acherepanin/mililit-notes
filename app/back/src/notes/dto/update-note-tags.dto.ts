import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateNoteTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags!: string[];
}
