import { Controller, Get } from '@nestjs/common';

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
