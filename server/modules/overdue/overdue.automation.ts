import { Inject, Logger } from '@nestjs/common';
import {
  Automation,
  BindTrigger,
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { overdueConfigs } from '@server/database/schema';
import { eq } from 'drizzle-orm';
import { OverdueService } from './overdue.service';

@Automation()
export class OverdueAutomationService {
  private readonly logger = new Logger(OverdueAutomationService.name);

  constructor(
    private readonly overdueService: OverdueService,
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  @BindTrigger('overdue_daily_reminder')
  async executeDailyReminder(): Promise<void> {
    this.logger.log('开始执行逾期每日提醒任务');

    const enabledConfigs = await this.db
      .select()
      .from(overdueConfigs)
      .where(eq(overdueConfigs.reminderEnabled, true));

    if (enabledConfigs.length === 0) {
      this.logger.log('没有启用提醒的逾期配置，跳过执行');
      return;
    }

    const reminderDay: number = enabledConfigs[0]?.reminderDay ?? 20;
    const today = new Date().getDate();
    if (today !== reminderDay) {
      this.logger.log(
        `今天${today}号不匹配提醒日${reminderDay}号，跳过执行`,
      );
      return;
    }

    try {
      const result = await this.overdueService.sendAllReminders();
      this.logger.log(
        `逾期每日提醒发送完成: 数量=${result.count}`,
      );
    } catch (error) {
      this.logger.error('逾期每日提醒发送失败', error as Error);
    }

    this.logger.log('逾期每日提醒任务执行完成');
  }
}
