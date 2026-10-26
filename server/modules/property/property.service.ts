import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { properties, companyEntities } from '@server/database/schema';
import { eq, desc } from 'drizzle-orm';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import type {
  CreatePropertyDto,
  UpdatePropertyDto,
  PropertyResponse,
  CreateCompanyDto,
  UpdateCompanyDto,
  CompanyEntityResponse,
} from '@shared/api.interface';

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private computeIsActive(validFrom: string, validTo: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    return validFrom <= today && today <= validTo;
  }

  // ========== 房产 CRUD ==========

  async findAll(activeOnly = false): Promise<PropertyResponse[]> {
    try {
      const rows = await this.db
        .select()
        .from(properties)
        .orderBy(desc(properties.createdAt));

      const result = rows.map((r) => ({
        id: r.id,
        name: r.name,
        companyEntity: r.companyEntity,
        companyId: r.companyId ?? undefined,
        validFrom: r.validFrom,
        validTo: r.validTo,
        totalArea: r.totalArea ?? undefined,
        rentableArea: r.rentableArea ?? undefined,
        isActive: this.computeIsActive(r.validFrom, r.validTo),
        _createdAt: r.createdAt?.toISOString(),
      }));

      return activeOnly ? result.filter((item) => item.isActive) : result;
    } catch (error) {
      this.logger.error('查询房产列表失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询房产列表失败: ${(error as Error).message}`,
      );
    }
  }

  async findOne(id: string): Promise<PropertyResponse> {
    try {
      const rows = await this.db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '房产信息不存在',
        );
      }

      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        companyEntity: r.companyEntity,
        companyId: r.companyId ?? undefined,
        validFrom: r.validFrom,
        validTo: r.validTo,
        totalArea: r.totalArea ?? undefined,
        rentableArea: r.rentableArea ?? undefined,
        isActive: this.computeIsActive(r.validFrom, r.validTo),
        _createdAt: r.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`查询房产详情失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询房产详情失败: ${(error as Error).message}`,
      );
    }
  }

  async create(dto: CreatePropertyDto): Promise<{ id: string }> {
    try {
      let companyEntity = dto.companyEntity;
      if (dto.companyId) {
        const company = await this.findCompanyOne(dto.companyId);
        companyEntity = company.name;
      }

      const inserted = await this.db
        .insert(properties)
        .values({
          name: dto.name,
          companyEntity,
          companyId: dto.companyId ?? null,
          validFrom: dto.validFrom,
          validTo: dto.validTo,
          totalArea: dto.totalArea ?? null,
          rentableArea: dto.rentableArea ?? null,
        })
        .returning({ id: properties.id });

      const propertyId = inserted[0]?.id;
      if (!propertyId) {
        throw new BusinessException(
          ResponseCode.INTERNAL_ERROR,
          '房产信息创建失败',
        );
      }

      this.logger.log(`房产信息创建成功, id: ${propertyId}`);
      return { id: propertyId };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        `创建房产信息失败: ${JSON.stringify(dto)}`,
        error as Error,
      );
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `创建房产信息失败: ${(error as Error).message}`,
      );
    }
  }

  async update(
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<{ id: string }> {
    try {
      const rows = await this.db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '房产信息不存在',
        );
      }

      const updateFields: Record<string, unknown> = {};
      if (dto.name !== undefined) updateFields.name = dto.name;
      if (dto.validFrom !== undefined) updateFields.validFrom = dto.validFrom;
      if (dto.validTo !== undefined) updateFields.validTo = dto.validTo;
      if (dto.totalArea !== undefined) updateFields.totalArea = dto.totalArea ?? null;
      if (dto.rentableArea !== undefined) updateFields.rentableArea = dto.rentableArea ?? null;

      if (dto.companyId !== undefined) {
        updateFields.companyId = dto.companyId ?? null;
        if (dto.companyId) {
          const company = await this.findCompanyOne(dto.companyId);
          updateFields.companyEntity = company.name;
        } else if (dto.companyEntity !== undefined) {
          updateFields.companyEntity = dto.companyEntity;
        }
      } else if (dto.companyEntity !== undefined) {
        updateFields.companyEntity = dto.companyEntity;
      }

      if (Object.keys(updateFields).length > 0) {
        await this.db
          .update(properties)
          .set(updateFields)
          .where(eq(properties.id, id));
      }

      this.logger.log(`房产信息更新成功, id: ${id}`);
      return { id };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`更新房产信息失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `更新房产信息失败: ${(error as Error).message}`,
      );
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const rows = await this.db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '房产信息不存在',
        );
      }

      await this.db.delete(properties).where(eq(properties.id, id));
      this.logger.log(`房产信息删除成功, id: ${id}`);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`删除房产信息失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `删除房产信息失败: ${(error as Error).message}`,
      );
    }
  }

  // ========== 公司主体 CRUD ==========

  async findAllCompanies(): Promise<CompanyEntityResponse[]> {
    try {
      const rows = await this.db
        .select()
        .from(companyEntities)
        .orderBy(desc(companyEntities.createdAt));

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        creditCode: r.creditCode ?? undefined,
        bankAccountName: r.bankAccountName ?? undefined,
        bankAccountNo: r.bankAccountNo ?? undefined,
        bankName: r.bankName ?? undefined,
        rentInvoiceTaxRate: r.rentInvoiceTaxRate ?? undefined,
        propertyFeeInvoiceTaxRate: r.propertyFeeInvoiceTaxRate ?? undefined,
        _createdAt: r.createdAt?.toISOString(),
      }));
    } catch (error) {
      this.logger.error('查询公司主体列表失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询公司主体列表失败: ${(error as Error).message}`,
      );
    }
  }

  async findCompanyOne(id: string): Promise<CompanyEntityResponse> {
    try {
      const rows = await this.db
        .select()
        .from(companyEntities)
        .where(eq(companyEntities.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '公司主体不存在',
        );
      }

      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        creditCode: r.creditCode ?? undefined,
        bankAccountName: r.bankAccountName ?? undefined,
        bankAccountNo: r.bankAccountNo ?? undefined,
        bankName: r.bankName ?? undefined,
        rentInvoiceTaxRate: r.rentInvoiceTaxRate ?? undefined,
        propertyFeeInvoiceTaxRate: r.propertyFeeInvoiceTaxRate ?? undefined,
        _createdAt: r.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`查询公司主体失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询公司主体失败: ${(error as Error).message}`,
      );
    }
  }

  async createCompany(dto: CreateCompanyDto): Promise<{ id: string }> {
    try {
      const inserted = await this.db
        .insert(companyEntities)
        .values({
          name: dto.name,
          creditCode: dto.creditCode ?? null,
          bankAccountName: dto.bankAccountName ?? null,
          bankAccountNo: dto.bankAccountNo ?? null,
          bankName: dto.bankName ?? null,
          rentInvoiceTaxRate: dto.rentInvoiceTaxRate ?? null,
          propertyFeeInvoiceTaxRate: dto.propertyFeeInvoiceTaxRate ?? null,
        })
        .returning({ id: companyEntities.id });

      const companyId = inserted[0]?.id;
      if (!companyId) {
        throw new BusinessException(
          ResponseCode.INTERNAL_ERROR,
          '公司主体创建失败',
        );
      }

      this.logger.log(`公司主体创建成功, id: ${companyId}`);
      return { id: companyId };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        `创建公司主体失败: ${JSON.stringify(dto)}`,
        error as Error,
      );
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `创建公司主体失败: ${(error as Error).message}`,
      );
    }
  }

  async updateCompany(
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<{ id: string }> {
    try {
      const rows = await this.db
        .select()
        .from(companyEntities)
        .where(eq(companyEntities.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '公司主体不存在',
        );
      }

      const updateFields: Record<string, unknown> = {};
      if (dto.name !== undefined) updateFields.name = dto.name;
      if (dto.creditCode !== undefined)
        updateFields.creditCode = dto.creditCode ?? null;
      if (dto.bankAccountName !== undefined)
        updateFields.bankAccountName = dto.bankAccountName ?? null;
      if (dto.bankAccountNo !== undefined)
        updateFields.bankAccountNo = dto.bankAccountNo ?? null;
      if (dto.bankName !== undefined)
        updateFields.bankName = dto.bankName ?? null;
      if (dto.rentInvoiceTaxRate !== undefined)
        updateFields.rentInvoiceTaxRate = dto.rentInvoiceTaxRate ?? null;
      if (dto.propertyFeeInvoiceTaxRate !== undefined)
        updateFields.propertyFeeInvoiceTaxRate = dto.propertyFeeInvoiceTaxRate ?? null;

      if (Object.keys(updateFields).length > 0) {
        await this.db
          .update(companyEntities)
          .set(updateFields)
          .where(eq(companyEntities.id, id));

        if (dto.name !== undefined) {
          await this.db
            .update(properties)
            .set({ companyEntity: dto.name })
            .where(eq(properties.companyId, id));
        }
      }

      this.logger.log(`公司主体更新成功, id: ${id}`);
      return { id };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`更新公司主体失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `更新公司主体失败: ${(error as Error).message}`,
      );
    }
  }

  async removeCompany(id: string): Promise<void> {
    try {
      const referenced = await this.db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.companyId, id))
        .limit(1);

      if (referenced.length > 0) {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          '该公司主体已被房产引用，无法删除',
        );
      }

      await this.db
        .delete(companyEntities)
        .where(eq(companyEntities.id, id));
      this.logger.log(`公司主体删除成功, id: ${id}`);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`删除公司主体失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `删除公司主体失败: ${(error as Error).message}`,
      );
    }
  }
}
