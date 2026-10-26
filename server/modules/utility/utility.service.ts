import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { utilityRecords, contracts, utilityTenants, properties, customers, receiveRecords } from '@server/database/schema';
import { eq, and, count, desc, sql, gte, inArray } from 'drizzle-orm';
import type {
  UtilityRecord,
  CreateUtilityDto,
  UpdateUtilityDto,
  UtilityListQuery,
  UtilityListResp,
  UtilityTenant,
} from '@shared/api.interface';

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getTenants(): Promise<UtilityTenant[]> {
    // 纯表驱动：租户清单只来源于 utility_tenants 表（is_active=true），
    // 不再动态合并 contracts（新建/编辑/变更合同打开水电费时由 ensureTenant 维护该表）
    const tenantRows = await this.db
      .select({
        id: utilityTenants.id,
        tenant: utilityTenants.tenant,
        propertyName: utilityTenants.propertyName,
        isActive: utilityTenants.isActive,
      })
      .from(utilityTenants)
      .where(eq(utilityTenants.isActive, true));

    // 房产名兜底：多房产维度改造前按租户维度写入的历史行 property_name 为 NULL，
    // 从开启水电费的合同中反查房产名（approved 优先、startDate 最新、排除该租户已有行房产）
    const missingRows = tenantRows.filter((r) => !r.propertyName);
    if (missingRows.length > 0) {
      const tenantNames = [...new Set(missingRows.map((r) => r.tenant))];
      const candidateRows = await this.db
        .select({
          tenant: contracts.tenant,
          status: contracts.status,
          startDate: contracts.startDate,
          propertyName: properties.name,
        })
        .from(contracts)
        .leftJoin(properties, eq(contracts.propertyId, properties.id))
        .where(
          and(
            inArray(contracts.tenant, tenantNames),
            eq(contracts.hasUtilities, true),
            sql`${properties.name} IS NOT NULL`,
          ),
        );

      // 排除该租户已有房产行的房产（NULL 行与房产行并存时互不覆盖）
      const existingPropsByTenant = new Map<string, Set<string>>();
      tenantRows.forEach((r) => {
        if (!r.propertyName) return;
        const set = existingPropsByTenant.get(r.tenant) ?? new Set<string>();
        set.add(r.propertyName);
        existingPropsByTenant.set(r.tenant, set);
      });

      missingRows.forEach((r) => {
        const best = candidateRows
          .filter(
            (c) =>
              c.tenant === r.tenant &&
              !existingPropsByTenant.get(r.tenant)?.has(c.propertyName ?? ''),
          )
          .sort(
            (a, b) =>
              (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1) ||
              b.startDate.localeCompare(a.startDate),
          )[0];
        if (best?.propertyName) {
          r.propertyName = best.propertyName;
        }
      });
    }

    return tenantRows.sort(
      (a: UtilityTenant, b: UtilityTenant) =>
        a.tenant.localeCompare(b.tenant, 'zh-CN') ||
        (a.propertyName ?? '').localeCompare(b.propertyName ?? '', 'zh-CN'),
    );
  }

  async ensureTenant(tenantName: string, propertyName?: string): Promise<void> {
    if (propertyName) {
      // 租户+房产维度：同租户不同房产可各自存在一行（索引 (tenant, property_name) 唯一）
      await this.db.execute(
        sql`INSERT INTO utility_tenants (tenant, property_name, is_active) VALUES (${tenantName}, ${propertyName}, true) ON CONFLICT (tenant, property_name) DO UPDATE SET is_active = true`
      );
    } else {
      // 兼容旧调用（无房产）：回退到原 tenant 维度逻辑，保底幂等
      await this.db.execute(
        sql`INSERT INTO utility_tenants (tenant, is_active) VALUES (${tenantName}, true) ON CONFLICT (tenant) DO UPDATE SET is_active = true`
      );
    }
    this.logger.log(`水电费租户已确保: ${tenantName}${propertyName ? ` / ${propertyName}` : ''}`);
  }

  /**
   * 合同终止后调用：若该租户+该房产名下已无生效合同（approved 且未过期），
   * 自动将 utility_tenants 中对应 (tenant, property_name) 行 is_active 置为 false（停用后不再出现在水电费管理页）。
   * 数据保留，可追溯；后续新建该租户该房产合同审核通过时会由 ensureTenant 重新激活显示。
   */
  async deactivateTenantIfNoActiveContract(tenantName: string, propertyName?: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    if (propertyName) {
      // 查该租户名下生效合同（approved 且未过期）涉及的房产 ID 集合
      const activeContractRows = await this.db
        .select({ propertyId: contracts.propertyId })
        .from(contracts)
        .where(
          and(
            eq(contracts.tenant, tenantName),
            eq(contracts.status, 'approved'),
            gte(contracts.endDate, today),
          ),
        );

      const activePropertyIds = activeContractRows
        .map((c) => c.propertyId)
        .filter((pid): pid is string => !!pid);

      // 无任何生效合同时直接停用该行
      if (activePropertyIds.length === 0) {
        await this.db
          .update(utilityTenants)
          .set({ isActive: false })
          .where(
            and(
              eq(utilityTenants.tenant, tenantName),
              eq(utilityTenants.propertyName, propertyName),
            ),
          );
        this.logger.log(`水电费租户已自动停用（无生效合同）: ${tenantName} / ${propertyName}`);
        return;
      }

      // 实时查 properties 得房产名集合，判断传入房产是否仍有生效合同
      const propRows = await this.db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(inArray(properties.id, activePropertyIds));
      const activeNames = new Set(propRows.map((p) => p.name));

      if (activeNames.has(propertyName)) {
        // 该租户该房产仍有生效合同，不需要停用
        return;
      }

      await this.db
        .update(utilityTenants)
        .set({ isActive: false })
        .where(
          and(
            eq(utilityTenants.tenant, tenantName),
            eq(utilityTenants.propertyName, propertyName),
          ),
        );

      this.logger.log(`水电费租户已自动停用（该房产无生效合同）: ${tenantName} / ${propertyName}`);
      return;
    }

    // 兼容旧调用（无房产）：仅当该租户名下无任何生效合同时停用全部行
    const activeContracts = await this.db
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenant, tenantName),
          eq(contracts.status, 'approved'),
          gte(contracts.endDate, today),
        ),
      )
      .limit(1);

    // 还有生效合同，不需要停用
    if (activeContracts.length > 0) return;

    await this.db
      .update(utilityTenants)
      .set({ isActive: false })
      .where(eq(utilityTenants.tenant, tenantName));

    this.logger.log(`水电费租户已自动停用（无生效合同）: ${tenantName}`);
  }

  async findAll(params: UtilityListQuery): Promise<UtilityListResp> {
    const { contractId, period, page = 1, pageSize = 20 } = params;

    const conditions = [];
    if (contractId) {
      conditions.push(eq(utilityRecords.contractId, contractId));
    }
    if (period) {
      conditions.push(eq(utilityRecords.period, period));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(utilityRecords)
        .where(whereClause)
        .orderBy(desc(utilityRecords.period), desc(utilityRecords.recordDate))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(utilityRecords)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    // 租户编码：按租户名称精确匹配 customers.companyName 带出（当前页数据量小，二次查询）
    const items = itemsResult as UtilityRecord[];
    let customerCodes = new Map<string, string>();
    const tenantNames = [...new Set(items.map((it) => it.tenant).filter(Boolean))];
    if (tenantNames.length > 0) {
      const customerRows = await this.db
        .select({
          companyName: customers.companyName,
          customerCode: customers.customerCode,
        })
        .from(customers)
        .where(inArray(customers.companyName, tenantNames));
      customerCodes = new Map(
        customerRows.map((c) => [c.companyName, c.customerCode]),
      );
    }
    const itemsWithCode = items.map((it) => ({
      ...it,
      customerCode: customerCodes.get(it.tenant) ?? undefined,
    }));

    return {
      items: itemsWithCode as UtilityRecord[],
      total,
      page,
      pageSize,
    };
  }

  async create(
    dto: CreateUtilityDto,
    recordedBy: string,
    userName: string,
  ): Promise<UtilityRecord> {
    // 查询合同信息获取 contractNo 和 tenant
    const contractResult = await this.db
      .select({
        contractNo: contracts.contractNo,
        tenant: contracts.tenant,
      })
      .from(contracts)
      .where(eq(contracts.id, dto.contractId))
      .limit(1);

    if (contractResult.length === 0) {
      throw new NotFoundException('合同不存在');
    }

    const contract = contractResult[0];

    // 费用总额以用户填写/传入值为准，缺省时按 用量×单价 兜底计算
    const totalElectricityFee = dto.totalElectricityFee != null
      ? Math.round(dto.totalElectricityFee * 100) / 100
      : Math.round(dto.electricityUsage * dto.electricityPrice * 100) / 100;
    const totalWaterFee = dto.totalWaterFee != null
      ? Math.round(dto.totalWaterFee * 100) / 100
      : Math.round(dto.waterUsage * dto.waterPrice * 100) / 100;

    const result = await this.db
      .insert(utilityRecords)
      .values({
        contractId: dto.contractId,
        contractNo: contract.contractNo,
        tenant: contract.tenant,
        period: dto.period,
        electricityUsage: dto.electricityUsage,
        electricityPrice: dto.electricityPrice,
        waterUsage: dto.waterUsage,
        waterPrice: dto.waterPrice,
        totalElectricityFee: totalElectricityFee,
        totalWaterFee: totalWaterFee,
        electricityReceived: 0,
        waterReceived: 0,
        recordDate: dto.recordDate,
        recordedBy: userName,
        createdBy: recordedBy,
        updatedBy: recordedBy,
      })
      .returning();

    return result[0] as unknown as UtilityRecord;
  }

  async update(
    id: string,
    dto: UpdateUtilityDto,
    userId: string,
    userName: string,
  ): Promise<UtilityRecord> {
    const existing = await this.db
      .select()
      .from(utilityRecords)
      .where(eq(utilityRecords.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('水电费记录不存在');
    }

    // 费用总额以用户填写/传入值为准，缺省时按 用量×单价 兜底计算
    const totalElectricityFee = dto.totalElectricityFee != null
      ? Math.round(dto.totalElectricityFee * 100) / 100
      : Math.round(dto.electricityUsage * dto.electricityPrice * 100) / 100;
    const totalWaterFee = dto.totalWaterFee != null
      ? Math.round(dto.totalWaterFee * 100) / 100
      : Math.round(dto.waterUsage * dto.waterPrice * 100) / 100;

    await this.db
      .update(utilityRecords)
      .set({
        electricityUsage: dto.electricityUsage,
        electricityPrice: dto.electricityPrice,
        waterUsage: dto.waterUsage,
        waterPrice: dto.waterPrice,
        totalElectricityFee,
        totalWaterFee,
        updatedBy: userId,
      })
      .where(eq(utilityRecords.id, id));

    const updated = await this.db
      .select()
      .from(utilityRecords)
      .where(eq(utilityRecords.id, id))
      .limit(1);

    const result = updated[0];

    return result as unknown as UtilityRecord;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(utilityRecords)
      .where(eq(utilityRecords.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('水电费记录不存在');
    }

    // 删除守卫：水电记录是 receive_records.ref_id 指向的事实源（无外键），
    // 存在关联收款时禁止删除，否则留下孤儿流水且已收回写无法追溯
    const receiptRows = await this.db
      .select({ id: receiveRecords.id })
      .from(receiveRecords)
      .where(
        and(
          eq(receiveRecords.refId, id),
          inArray(receiveRecords.receiveType, ['water', 'electricity']),
        ),
      )
      .limit(1);
    if (receiptRows.length > 0) {
      throw new ConflictException('该水电费记录已存在收款，请先删除对应收款记录');
    }

    await this.db
      .delete(utilityRecords)
      .where(eq(utilityRecords.id, id));
  }
}
