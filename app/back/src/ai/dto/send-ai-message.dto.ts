import { IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendAiMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsArray()
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;

  @IsOptional()
  @IsObject()
  currentNote?: { id?: number; name?: string; contentHtml?: string; contentText?: string };
}
