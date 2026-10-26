import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { LedgerService } from './ledger.service';
import type {
  LedgerListResp,
  LedgerListQuery,
  ColumnConfigResp,
  SaveColumnConfigDto,
  LedgerUnpaidPeriodItem,
} from '@shared/api.interface';

@Controller('api/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @NeedLogin()
  @Can('read', 'Ledger')
  @Get()
  async findAll(
    @Query('contractId') contractId?: string,
    @Query('contractNo') contractNo?: string,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('tenant') tenant?: string,
    @Query('propertyName') propertyName?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<LedgerListResp> {
    const params: LedgerListQuery = {
      contractId,
      contractNo,
      period,
      status: status ? status.split(',') : undefined,
      tenant,
      propertyName,
      overdue: overdue === 'true' ? true : overdue === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    };
    return this.ledgerService.findAll(params);
  }

  @NeedLogin()
  @Can('read', 'Ledger')
  @Get('unpaid-periods')
  async getUnpaidPeriods(
    @Query('contractId') contractId?: string,
  ): Promise<LedgerUnpaidPeriodItem[]> {
    return this.ledgerService.getUnpaidPeriods(contractId);
  }

  @NeedLogin()
  @Can('read', 'Ledger')
  @Get('column-config')
  async getColumnConfig(@Req() req: Request): Promise<ColumnConfigResp> {
    const { userId } = req.userContext;
    return this.ledgerService.getColumnConfig(userId);
  }

  @NeedLogin()
  @Can('edit', 'Ledger')
  @Put('column-config')
  async saveColumnConfig(
    @Body() dto: SaveColumnConfigDto,
    @Req() req: Request,
  ): Promise<ColumnConfigResp> {
    const { userId } = req.userContext;
    return this.ledgerService.saveColumnConfig(userId, dto.hiddenColumns);
  }
}
