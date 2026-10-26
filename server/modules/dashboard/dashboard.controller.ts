import { Controller, Get, Query } from '@nestjs/common';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { DashboardService } from './dashboard.service';
import type { PropertyRentSummaryResp } from '@shared/api.interface';

@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * 数据看板 - 房产出租概况（第 1 卡片）
   * GET /api/dashboard/property-rent-summary?year=2026&month=6
   * 权限点：read:Dashboard
   */
  @NeedLogin()
  @Can('read', 'Dashboard')
  @Get('property-rent-summary')
  async getPropertyRentSummary(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<PropertyRentSummaryResp> {
    const now = new Date();
    return this.dashboardService.getPropertyRentSummary(
      year ? parseInt(year, 10) : now.getFullYear(),
      month ? parseInt(month, 10) : now.getMonth() + 1,
    );
  }
}
