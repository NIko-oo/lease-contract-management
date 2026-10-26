import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { NeedLogin, Can } from '@lark-apaas/fullstack-nestjs-core';
import { PropertyService } from './property.service';
import type {
  CreatePropertyDto,
  UpdatePropertyDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from '@shared/api.interface';

@Controller('api/properties')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  // ========== 房产接口 ==========

  @NeedLogin()
  @Can('read', 'Property')
  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.propertyService.findAll(activeOnly === 'true');
  }

  @NeedLogin()
  @Can('read', 'Property')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertyService.findOne(id);
  }

  @NeedLogin()
  @Can('create', 'Property')
  @Post()
  async create(@Body() dto: CreatePropertyDto) {
    return this.propertyService.create(dto);
  }

  @NeedLogin()
  @Can('update', 'Property')
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertyService.update(id, dto);
  }

  @NeedLogin()
  @Can('delete', 'Property')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.propertyService.remove(id);
  }
}

@Controller('api/companies')
export class CompanyController {
  constructor(private readonly propertyService: PropertyService) {}

  @NeedLogin()
  @Can('read', 'Property')
  @Get()
  async findAll() {
    return this.propertyService.findAllCompanies();
  }

  @NeedLogin()
  @Can('read', 'Property')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertyService.findCompanyOne(id);
  }

  @NeedLogin()
  @Can('create', 'Property')
  @Post()
  async create(@Body() dto: CreateCompanyDto) {
    return this.propertyService.createCompany(dto);
  }

  @NeedLogin()
  @Can('update', 'Property')
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.propertyService.updateCompany(id, dto);
  }

  @NeedLogin()
  @Can('delete', 'Property')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.propertyService.removeCompany(id);
  }
}
