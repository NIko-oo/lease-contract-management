import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { OverdueService } from './overdue.service';
import type { UpdateOverdueConfigDto } from '@shared/api.interface';

@Controller('api/overdue')
export class OverdueController {
  constructor(private readonly overdueService: OverdueService) {}

  @NeedLogin()
  @Can('read', 'Overdue')
  @Get('config')
  async getConfig() {
    return this.overdueService.getConfig();
  }

  @NeedLogin()
  @Can('config', 'Overdue')
  @Put('config/:type')
  async updateConfig(
    @Param('type') type: string,
    @Body() dto: UpdateOverdueConfigDto,
  ) {
    return this.overdueService.updateConfig(type, dto);
  }

  @NeedLogin()
  @Can('read', 'Overdue')
  @Get('rent-overdue')
  async getRentOverdue() {
    return this.overdueService.getRentOverdue();
  }

  @NeedLogin()
  @Can('read', 'Overdue')
  @Get('utility-overdue')
  async getUtilityOverdue() {
    return this.overdueService.getUtilityOverdue();
  }

  @NeedLogin()
  @Can('read', 'Overdue')
  @Get('utility-unregistered')
  async getUtilityUnregistered() {
    return this.overdueService.getUtilityUnregistered();
  }

  @NeedLogin()
  @Can('send', 'Overdue')
  @Post('send-reminder')
  async sendReminder(
    @Body() dto: { type: string },
  ): Promise<{ success: boolean; count: number }> {
    return this.overdueService.sendReminder(
      dto.type as 'rent' | 'utility' | 'utility_unregistered',
    );
  }

  @NeedLogin()
  @Can('send', 'Overdue')
  @Post('send-all-reminder')
  async sendAllReminder(): Promise<{ success: boolean; count: number }> {
    return this.overdueService.sendAllReminders();
  }
}
