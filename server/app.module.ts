import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';
import { DbPermissionResolver } from './modules/permission/db-permission-resolver';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ContractModule } from './modules/contract/contract.module';
import { TerminationModule } from './modules/termination/termination.module';
import { ViewModule } from './modules/view/view.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { UtilityModule } from './modules/utility/utility.module';
import { PropertyModule } from './modules/property/property.module';
import { OverdueModule } from './modules/overdue/overdue.module';
import { PermissionModule } from './modules/permission/permission.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReceiptModule } from './modules/receipt/receipt.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot({
      authz: { permissionResolver: DbPermissionResolver },
    }),
    // ====== @route-section: business-modules START ======
    PropertyModule,
    ContractModule,
    TerminationModule,
    LedgerModule,
    UtilityModule,
    OverdueModule,
    PermissionModule,
    CustomerModule,
    DashboardModule,
    ReceiptModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
