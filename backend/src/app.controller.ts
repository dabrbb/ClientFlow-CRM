import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  health() {
    return {
      name: 'ClientFlow CRM API',
      status: 'ok',
      version: '1.0.0',
    };
  }
}
