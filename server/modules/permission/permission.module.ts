import { Module } from '@nestjs/common';
import { DbPermissionResolver } from './db-permission-resolver';
import { PermissionController } from './permission.controller';

@Module({
  controllers: [PermissionController],
  providers: [DbPermissionResolver],
  exports: [DbPermissionResolver],
})
export class PermissionModule {}
