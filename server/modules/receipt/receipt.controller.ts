import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { ReceiptService } from './receipt.service';
import type {
  ReceiveListResp,
  ReceiveRecord,
  CreateReceiveDto,
  ReceiveListQuery,
  UpdateReceiveInvoiceDto,
} from '@shared/api.interface';

@Controller('api/receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @NeedLogin()
  @Can('read', 'Receipt')
  @Get()
  async findAll(
    @Query('propertyName') propertyName?: string,
    @Query('contractNo') contractNo?: string,
    @Query('keyword') keyword?: string,
    @Query('receiveType') receiveType?: string,
    @Query('receiveStart') receiveStart?: string,
    @Query('receiveEnd') receiveEnd?: string,
    @Query('period') period?: string,
    @Query('contractId') contractId?: string,
    @Query('refId') refId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ReceiveListResp> {
    const params: ReceiveListQuery = {
      propertyName,
      contractNo,
      keyword,
      receiveType: (receiveType as ReceiveListQuery['receiveType']) || undefined,
      receiveStart,
      receiveEnd,
      period,
      contractId,
      refId,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    };
    return this.receiptService.findAll(params);
  }

  @NeedLogin()
  @Can('edit', 'Receipt')
  @Post()
  async create(
    @Body() dto: CreateReceiveDto,
    @Req() req: Request,
  ): Promise<ReceiveRecord[]> {
    const { userId } = req.userContext;
    return this.receiptService.create(dto, userId);
  }

  @NeedLogin()
  @Can('edit', 'Receipt')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext;
    await this.receiptService.remove(id, userId);
    return { success: true };
  }

  @NeedLogin()
  @Can('edit', 'Receipt')
  @Patch(':id/invoice')
  async updateInvoice(
    @Param('id') id: string,
    @Body() dto: UpdateReceiveInvoiceDto,
    @Req() req: Request,
  ): Promise<ReceiveRecord> {
    const { userId } = req.userContext;
    return this.receiptService.updateInvoice(id, dto.invoiceNo, userId);
  }
}