import { IsObject, IsString, MaxLength } from 'class-validator';

export class ExecuteAiToolDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
