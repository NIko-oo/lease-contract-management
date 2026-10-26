import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { CustomerService } from './customer.service';
import type {
  CreateCustomerDto,
  UpdateCustomerDto,
} from '@shared/api.interface';

@Controller('api/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @NeedLogin()
  @Can('read', 'Customer')
  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('frozen') frozen?: string,
  ) {
    return this.customerService.findAll(search, frozen);
  }

  @NeedLogin()
  @Can('read', 'Customer')
  @Get('search')
  async search(@Query('q') q?: string) {
    return this.customerService.searchActive(q);
  }

  @NeedLogin()
  @Can('read', 'Customer')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customerService.findOne(id);
  }

  @NeedLogin()
  @Can('edit', 'Customer')
  @Post()
  async create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @NeedLogin()
  @Can('edit', 'Customer')
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(id, dto);
  }

  @NeedLogin()
  @Can('edit', 'Customer')
  @Patch(':id/freeze')
  async freeze(@Param('id') id: string, @Body() body: { isFrozen: boolean }) {
    return this.customerService.freeze(id, body.isFrozen);
  }
}
