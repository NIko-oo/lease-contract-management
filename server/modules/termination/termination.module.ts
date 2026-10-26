import { Module } from '@nestjs/common';
import { TerminationController } from './termination.controller';
import { TerminationService } from './termination.service';
import { UtilityModule } from '@server/modules/utility/utility.module';

@Module({
  imports: [UtilityModule],
  controllers: [TerminationController],
  providers: [TerminationService],
})
export class TerminationModule {}
