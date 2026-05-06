import { IsIn } from 'class-validator';

import type { AiBotProvider } from '../ai.types';

export class CreateAiBotLinkCodeDto {
  @IsIn(['telegram', 'vk'])
  provider!: AiBotProvider;
}
