import { Controller, Get } from '@nestjs/common';

import { Public } from './auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { status: 'ok'; service: 'notes'; time: string } {
    return {
      status: 'ok',
      service: 'notes',
      time: new Date().toISOString(),
    };
  }
}
