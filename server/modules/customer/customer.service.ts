import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { customers } from '@server/database/schema';
import { eq, desc, ilike, and, or } from 'drizzle-orm';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import type {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerResponse,
} from '@shared/api.interface';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async findAll(
    search?: string,
    frozen?: string,
  ): Promise<CustomerResponse[]> {
    try {
      const conditions: ReturnType<typeof eq>[] = [];

      if (search) {
        conditions.push(
          or(
            ilike(customers.customerCode, `%${search}%`),
            ilike(customers.companyName, `%${search}%`),
          ),
        );
      }

      if (frozen !== undefined) {
        conditions.push(eq(customers.isFrozen, frozen === 'true'));
      }

      const query = conditions.length > 0
        ? this.db
            .select()
            .from(customers)
            .where(and(...conditions))
            .orderBy(desc(customers.createdAt))
        : this.db
            .select()
            .from(customers)
            .orderBy(desc(customers.createdAt));

      const rows = await query;

      return rows.map((r) => ({
        id: r.id,
        customerCode: r.customerCode,
        companyName: r.companyName,
        creditCode: r.creditCode ?? undefined,
        bankAccount: r.bankAccount ?? undefined,
        tenantType: r.tenantType ?? undefined,
        bankName: r.bankName ?? undefined,
        isFrozen: r.isFrozen,
        _createdAt: r.createdAt?.toISOString(),
      }));
    } catch (error) {
      this.logger.error('查询客户列表失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询客户列表失败: ${(error as Error).message}`,
      );
    }
  }

  async searchActive(q?: string): Promise<CustomerResponse[]> {
    try {
      if (!q || q.trim().length === 0) {
        const rows = await this.db
          .select()
          .from(customers)
          .where(eq(customers.isFrozen, false))
          .orderBy(desc(customers.createdAt))
          .limit(20);

        return rows.map((r) => ({
          id: r.id,
          customerCode: r.customerCode,
          companyName: r.companyName,
          creditCode: r.creditCode ?? undefined,
          bankAccount: r.bankAccount ?? undefined,
          tenantType: r.tenantType ?? undefined,
          bankName: r.bankName ?? undefined,
          isFrozen: r.isFrozen,
          _createdAt: r.createdAt?.toISOString(),
        }));
      }

      const keyword = `%${q.trim()}%`;
      const rows = await this.db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.isFrozen, false),
            ilike(customers.customerCode, keyword),
          ),
        )
        .orderBy(desc(customers.createdAt))
        .limit(20);

      const rows2 = await this.db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.isFrozen, false),
            ilike(customers.companyName, keyword),
          ),
        )
        .orderBy(desc(customers.createdAt))
        .limit(20);

      const merged = new Map<string, CustomerResponse>();
      for (const r of [...rows, ...rows2]) {
        if (!merged.has(r.id)) {
          merged.set(r.id, {
            id: r.id,
            customerCode: r.customerCode,
            companyName: r.companyName,
            creditCode: r.creditCode ?? undefined,
            bankAccount: r.bankAccount ?? undefined,
            tenantType: r.tenantType ?? undefined,
            bankName: r.bankName ?? undefined,
            isFrozen: r.isFrozen,
            _createdAt: r.createdAt?.toISOString(),
          });
        }
      }

      return Array.from(merged.values());
    } catch (error) {
      this.logger.error('搜索客户失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `搜索客户失败: ${(error as Error).message}`,
      );
    }
  }

  async findOne(id: string): Promise<CustomerResponse> {
    try {
      const rows = await this.db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);

      if (rows.length === 0) {
        throw new BusinessException(ResponseCode.NOT_FOUND, '客户不存在');
      }

      const r = rows[0];
      return {
        id: r.id,
        customerCode: r.customerCode,
        companyName: r.companyName,
        creditCode: r.creditCode ?? undefined,
        bankAccount: r.bankAccount ?? undefined,
        tenantType: r.tenantType ?? undefined,
        bankName: r.bankName ?? undefined,
        isFrozen: r.isFrozen,
        _createdAt: r.createdAt?.toISOString(),
      };
    } catch (error) {
      this.logger.error('查询客户详情失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询客户详情失败: ${(error as Error).message}`,
      );
    }
  }

  async create(dto: CreateCustomerDto): Promise<{ id: string }> {
    try {
      this.logger.log(`创建客户: ${dto.customerCode}`);

      const existing = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerCode, dto.customerCode))
        .limit(1);

      if (existing.length > 0) {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          `客户编码 ${dto.customerCode} 已存在`,
        );
      }

      const inserted = await this.db
        .insert(customers)
        .values({
          customerCode: dto.customerCode,
          companyName: dto.companyName,
          creditCode: dto.creditCode ?? null,
          bankAccount: dto.bankAccount ?? null,
          tenantType: dto.tenantType ?? null,
          bankName: dto.bankName ?? null,
          isFrozen: false,
        })
        .returning({ id: customers.id });

      const id = inserted[0]?.id;
      if (!id) {
        throw new BusinessException(ResponseCode.INTERNAL_ERROR, '客户创建失败');
      }

      return { id };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error('创建客户失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `创建客户失败: ${(error as Error).message}`,
      );
    }
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerResponse> {
    try {
      this.logger.log(`更新客户: ${id}`);

      const existing = await this.db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new BusinessException(ResponseCode.NOT_FOUND, '客户不存在');
      }

      if (dto.customerCode && dto.customerCode !== existing[0].customerCode) {
        const duplicate = await this.db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.customerCode, dto.customerCode))
          .limit(1);

        if (duplicate.length > 0) {
          throw new BusinessException(
            ResponseCode.BAD_REQUEST,
            `客户编码 ${dto.customerCode} 已存在`,
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      if (dto.customerCode !== undefined) updateData.customerCode = dto.customerCode;
      if (dto.companyName !== undefined) updateData.companyName = dto.companyName;
      if (dto.creditCode !== undefined) updateData.creditCode = dto.creditCode;
      if (dto.bankAccount !== undefined) updateData.bankAccount = dto.bankAccount;
      if (dto.tenantType !== undefined) updateData.tenantType = dto.tenantType;
      if (dto.bankName !== undefined) updateData.bankName = dto.bankName;
      if (dto.isFrozen !== undefined) updateData.isFrozen = dto.isFrozen;

      const updated = await this.db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, id))
        .returning();

      const r = updated[0];
      return {
        id: r.id,
        customerCode: r.customerCode,
        companyName: r.companyName,
        creditCode: r.creditCode ?? undefined,
        bankAccount: r.bankAccount ?? undefined,
        tenantType: r.tenantType ?? undefined,
        bankName: r.bankName ?? undefined,
        isFrozen: r.isFrozen,
        _createdAt: r.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error('更新客户失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `更新客户失败: ${(error as Error).message}`,
      );
    }
  }

  async freeze(id: string, isFrozen: boolean): Promise<CustomerResponse> {
    try {
      this.logger.log(`${isFrozen ? '冻结' : '解冻'}客户: ${id}`);

      const updated = await this.db
        .update(customers)
        .set({ isFrozen })
        .where(eq(customers.id, id))
        .returning();

      if (updated.length === 0) {
        throw new BusinessException(ResponseCode.NOT_FOUND, '客户不存在');
      }

      const r = updated[0];
      return {
        id: r.id,
        customerCode: r.customerCode,
        companyName: r.companyName,
        creditCode: r.creditCode ?? undefined,
        bankAccount: r.bankAccount ?? undefined,
        tenantType: r.tenantType ?? undefined,
        bankName: r.bankName ?? undefined,
        isFrozen: r.isFrozen,
        _createdAt: r.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error('冻结/解冻客户失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `操作失败: ${(error as Error).message}`,
      );
    }
  }
}
