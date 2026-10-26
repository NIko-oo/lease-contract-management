import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { UtilityService } from './utility.service';
import type {
  UtilityListResp,
  UtilityRecord,
  CreateUtilityDto,
  UpdateUtilityDto,
  UtilityListQuery,
  UtilityTenant,
} from '@shared/api.interface';

@Controller('api/utilities')
export class UtilityController {
  constructor(private readonly utilityService: UtilityService) {}

  @NeedLogin()
  @Can('read', 'Utility')
  @Get('tenants')
  async getTenants(): Promise<UtilityTenant[]> {
    return this.utilityService.getTenants();
  }

  @NeedLogin()
  @Can('read', 'Utility')
  @Get()
  async findAll(
    @Query('contractId') contractId?: string,
    @Query('period') period?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<UtilityListResp> {
    const params: UtilityListQuery = {
      contractId,
      period,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    };
    return this.utilityService.findAll(params);
  }

  @NeedLogin()
  @Can('edit', 'Utility')
  @Post()
  async create(
    @Body() dto: CreateUtilityDto,
    @Req() req: Request,
  ): Promise<UtilityRecord> {
    const { userId, userName } = req.userContext;
    return this.utilityService.create(dto, userId, userName);
  }

  @NeedLogin()
  @Can('edit', 'Utility')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUtilityDto,
    @Req() req: Request,
  ): Promise<UtilityRecord> {
    const { userId, userName } = req.userContext;
    return this.utilityService.update(id, dto, userId, userName);
  }

  @NeedLogin()
  @Can('edit', 'Utility')
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.utilityService.delete(id);
    return { success: true };
  }
}
