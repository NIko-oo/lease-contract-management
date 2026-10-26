import { Module } from '@nestjs/common';
import { OverdueController } from './overdue.controller';
import { OverdueService } from './overdue.service';
import { OverdueAutomationService } from './overdue.automation';

@Module({
  controllers: [OverdueController],
  providers: [OverdueService, OverdueAutomationService],
  exports: [OverdueService],
})
export class OverdueModule {}
