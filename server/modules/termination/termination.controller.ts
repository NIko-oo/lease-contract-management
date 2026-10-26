import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { TerminationService } from './termination.service';
import type {
  CreateTerminationDto,
  ReviewTerminationDto,
  TerminationListResponse,
  TerminationRequest,
  TerminationCheckPeriodResponse,
} from '@shared/api.interface';

@Controller('api/terminations')
export class TerminationController {
  constructor(
    private readonly terminationService: TerminationService,
  ) {}

  @NeedLogin()
  @Can('read', 'Termination')
  @Get()
  async findAll(
    @Query('status') status?: string,
  ): Promise<TerminationListResponse> {
    const items = await this.terminationService.findAll({ status });
    return { items, total: items.length };
  }

  @NeedLogin()
  @Can('read', 'Termination')
  @Get('check-period')
  async checkPeriod(
    @Query('contractId') contractId: string,
    @Query('terminationDate') terminationDate: string,
  ): Promise<TerminationCheckPeriodResponse> {
    return this.terminationService.checkPeriod(contractId, terminationDate);
  }

  @NeedLogin()
  @Can('create', 'Termination')
  @Post()
  async create(
    @Req() req: Request,
    @Body() dto: CreateTerminationDto,
  ): Promise<TerminationRequest> {
    const { userName } = req.userContext;
    return this.terminationService.create(dto, userName);
  }

  @NeedLogin()
  @Can('review', 'Finance')
  @Post(':id/review')
  async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewTerminationDto,
  ): Promise<TerminationRequest> {
    const { userName } = req.userContext;
    return this.terminationService.review(id, dto, userName);
  }

  @NeedLogin()
  @Can('create', 'Termination')
  @Post(':id/withdraw')
  async withdraw(
    @Param('id') id: string,
  ): Promise<TerminationRequest> {
    return this.terminationService.withdraw(id);
  }
}
