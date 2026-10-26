import { Module } from '@nestjs/common';
import { PropertyController, CompanyController } from './property.controller';
import { PropertyService } from './property.service';

@Module({
  controllers: [PropertyController, CompanyController],
  providers: [PropertyService],
  exports: [PropertyService],
})
export class PropertyModule {}
