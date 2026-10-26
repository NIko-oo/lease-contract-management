import { Module } from '@nestjs/common';
import { UtilityModule } from '../utility/utility.module';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';

@Module({
  imports: [UtilityModule],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}
