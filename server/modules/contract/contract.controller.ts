import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { ContractService } from './contract.service';
import type {
  CreateContractDto,
  UpdateContractDto,
  ReviewContractDto,
  CreateContractAmendmentDto,
  ReviewAmendmentDto,
} from '@shared/api.interface';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

@Controller('api/contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @NeedLogin()
  @Can('read', 'Contract')
  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('tenant') tenant?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.contractService.findAll({
      status,
      tenant,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @NeedLogin()
  @Can('read', 'Contract')
  @Get(':id/amendments')
  async findAmendments(@Param('id') id: string) {
    return this.contractService.findAmendments(id);
  }

  @NeedLogin()
  @Can('read', 'Contract')
  @Get(':id/last-paid-period')
  async getLastPaidPeriod(@Param('id') id: string) {
    const period = await this.contractService.getLastPaidPeriod(id);
    return { period };
  }

  @NeedLogin()
  @Can('read', 'Contract')
  @Get(':id/amendment-periods')
  async getAmendmentPeriods(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('请提供变更开始日期和结束日期');
    }
    return this.contractService.getAmendmentPeriods(id, startDate, endDate);
  }

  @NeedLogin()
  @Can('read', 'Contract')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    if (!isValidUUID(id)) {
      throw new BadRequestException('无效的合同ID格式');
    }
    return this.contractService.findOne(id);
  }

  @NeedLogin()
  @Can('create', 'Contract')
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateContractDto) {
    const { userId } = req.userContext;
    return this.contractService.createContract(dto, userId);
  }

  @NeedLogin()
  @Can('update', 'Contract')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto
  ) {
    return this.contractService.update(id, dto);
  }

  @NeedLogin()
  @Can('submit', 'Contract')
  @Patch(':id/submit')
  async submitForReview(@Param('id') id: string) {
    return this.contractService.submitForReview(id);
  }

  @NeedLogin()
  @Can('review', 'Finance')
  @Patch(':id/review')
  async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewContractDto
  ) {
    const { userId } = req.userContext;
    const remark = dto.remark ?? '';
    return this.contractService.review(
      id,
      dto.action,
      remark,
      userId
    );
  }

  @NeedLogin()
  @Can('review', 'Finance')
  @Patch('amendments/:amendmentId/review')
  async reviewAmendment(
    @Req() req: Request,
    @Param('amendmentId') amendmentId: string,
    @Body() dto: ReviewAmendmentDto,
  ) {
    const { userId } = req.userContext;
    const remark = dto.remark ?? '';
    return this.contractService.reviewAmendment(
      amendmentId,
      dto.action,
      remark,
      userId,
    );
  }

  @NeedLogin()
  @Can('delete', 'Contract')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.contractService.remove(id);
  }

  @NeedLogin()
  @Can('amend', 'Contract')
  @Post('amend')
  async createAmendment(
    @Req() req: Request,
    @Body() dto: CreateContractAmendmentDto,
  ) {
    const { userId } = req.userContext;
    return this.contractService.createAmendment(dto, userId);
  }

  @NeedLogin()
  @Can('config', 'Sync')
  @Post(':id/regenerate-ledger')
  async regenerateLedger(@Param('id') id: string) {
    return this.contractService.regenerateLedger(id);
  }
}
