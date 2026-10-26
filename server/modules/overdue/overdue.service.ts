import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  overdueConfigs,
  ledgerItems,
  utilityRecords,
  contracts,
  properties,
} from '@server/database/schema';
import { eq, and, inArray, lt, sql } from 'drizzle-orm';
import type {
  UpdateOverdueConfigDto,
  RentOverdueItem,
  UtilityOverdueItem,
  UtilityUnregisteredGroup,
} from '@shared/api.interface';

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly capabilityService: CapabilityService,
  ) {}

  async getConfig() {
    const configs = await this.db
      .select()
      .from(overdueConfigs)
      .orderBy(overdueConfigs.configType);
    return configs;
  }

  async updateConfig(
    configType: string,
    dto: UpdateOverdueConfigDto,
  ) {
    const validTypes = ['rent', 'utility', 'utility_unregistered'];
    if (!validTypes.includes(configType)) {
      throw new BadRequestException(
        `无效的配置类型: ${configType}`,
      );
    }

    const existing = await this.db
      .select()
      .from(overdueConfigs)
      .where(eq(overdueConfigs.configType, configType));

    const updateData: Record<string, any> = {};
    if (dto.followerIds !== undefined) {
      updateData.followerIds = dto.followerIds;
    }
    if (dto.reminderEnabled !== undefined) {
      updateData.reminderEnabled = dto.reminderEnabled;
    }
    if (dto.reminderCron !== undefined) {
      updateData.reminderCron = dto.reminderCron;
    }
    if (dto.reminderDay !== undefined) {
      updateData.reminderDay = dto.reminderDay;
    }

    if (existing.length > 0) {
      await this.db
        .update(overdueConfigs)
        .set(updateData)
        .where(eq(overdueConfigs.configType, configType));

      const updated = await this.db
        .select()
        .from(overdueConfigs)
        .where(eq(overdueConfigs.configType, configType));
      return updated[0];
    } else {
      const result = await this.db
        .insert(overdueConfigs)
        .values({
          configType,
          followerIds: dto.followerIds ?? [],
          reminderEnabled: dto.reminderEnabled ?? false,
          reminderCron:
            dto.reminderCron ?? '0 9 * * 1-5',
          reminderDay: dto.reminderDay ?? 20,
        })
        .returning();
      return result[0];
    }
  }

  async getRentOverdue(): Promise<
    { data: RentOverdueItem[]; followerIds: string[] }
  > {
    const config = await this.db
      .select()
      .from(overdueConfigs)
      .where(eq(overdueConfigs.configType, 'rent'));

    const followerIds: string[] = config[0]?.followerIds ?? [];

    const items = await this.db
      .select({
        contractNo: ledgerItems.contractNo,
        period: ledgerItems.period,
        monthlyRent: ledgerItems.monthlyRent,
        monthlyPropertyFee: ledgerItems.monthlyPropertyFee,
        amendmentRent: ledgerItems.amendmentRent,
        amendmentPropertyFee: ledgerItems.amendmentPropertyFee,
        rentReceived: ledgerItems.rentReceived,
        propertyFeeReceived: ledgerItems.propertyFeeReceived,
        dueDate: ledgerItems.dueDate,
        tenant: ledgerItems.tenant,
        contractId: ledgerItems.contractId,
        overdueDays: sql<number>`(CURRENT_DATE - TO_DATE(${ledgerItems.dueDate}, 'YYYY-MM-DD'))`,
      })
      .from(ledgerItems)
      .where(
        and(
          inArray(ledgerItems.status, ['unpaid', 'partial']),
          lt(sql`TO_DATE(${ledgerItems.dueDate}, 'YYYY-MM-DD')`, sql`CURRENT_DATE`),
        ),
      )
      .orderBy(ledgerItems.dueDate);

    const data: RentOverdueItem[] = items.map((item) => {
      // 应收口径：amendment_* 为 null 才回落原值（0 是有效减免，不能按 falsy 回落）
      const receivableRent =
        item.amendmentRent != null ? Number(item.amendmentRent) : Number(item.monthlyRent);
      const receivablePropertyFee =
        item.amendmentPropertyFee != null
          ? Number(item.amendmentPropertyFee)
          : Number(item.monthlyPropertyFee);
      const unpaidRent =
        receivableRent - Number(item.rentReceived);
      const unpaidPropertyFee =
        receivablePropertyFee -
        Number(item.propertyFeeReceived);

      return {
        contractNo: item.contractNo,
        period: item.period,
        receivableRent,
        receivablePropertyFee,
        unpaidRent,
        unpaidPropertyFee,
        dueDate: item.dueDate,
        overdueDays: Number(item.overdueDays),
        tenant: item.tenant,
        contractId: item.contractId,
      };
    });

    return { data, followerIds };
  }

  async getUtilityOverdue(): Promise<{
    data: UtilityOverdueItem[];
    followerIds: string[];
  }> {
    const config = await this.db
      .select()
      .from(overdueConfigs)
      .where(eq(overdueConfigs.configType, 'utility'));

    const followerIds: string[] = config[0]?.followerIds ?? [];

    const items = await this.db
      .select({
        contractNo: utilityRecords.contractNo,
        period: utilityRecords.period,
        totalElectricityFee: utilityRecords.totalElectricityFee,
        totalWaterFee: utilityRecords.totalWaterFee,
        electricityReceived:
          utilityRecords.electricityReceived,
        waterReceived: utilityRecords.waterReceived,
        tenant: utilityRecords.tenant,
        contractId: utilityRecords.contractId,
      })
      .from(utilityRecords)
      .where(
        sql`(${utilityRecords.electricityReceived} + ${utilityRecords.waterReceived}) < (${utilityRecords.totalElectricityFee} + ${utilityRecords.totalWaterFee})`,
      );

    // 房产名映射：utilityRecords.contractId -> contracts.propertyId -> properties.name
    const overdueContractIds = [
      ...new Set(
        items
          .map((i) => i.contractId)
          .filter((cid): cid is string => !!cid),
      ),
    ];
    const contractPropertyMap = new Map<
      string,
      string
    >(); // contractId -> propertyId
    const propertyNameOf = new Map<string, string>(); // propertyId -> name
    if (overdueContractIds.length > 0) {
      const overdueContractRows = await this.db
        .select({
          id: contracts.id,
          propertyId: contracts.propertyId,
        })
        .from(contracts)
        .where(
          inArray(contracts.id, overdueContractIds),
        );
      const overduePropertyIds = [
        ...new Set(
          overdueContractRows
            .map((c) => c.propertyId)
            .filter((pid): pid is string => !!pid),
        ),
      ];
      for (const c of overdueContractRows) {
        if (c.propertyId) {
          contractPropertyMap.set(c.id, c.propertyId);
        }
      }
      if (overduePropertyIds.length > 0) {
        const overduePropRows = await this.db
          .select({ id: properties.id, name: properties.name })
          .from(properties)
          .where(
            inArray(properties.id, overduePropertyIds),
          );
        for (const p of overduePropRows) {
          propertyNameOf.set(p.id, p.name);
        }
      }
    }

    const data: UtilityOverdueItem[] = items
      .map((item): UtilityOverdueItem | null => {
        const periodDate = new Date(
          item.period + '-01',
        );
        const nextMonth = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);
        const lastDayOfNextMonth = new Date(
          nextMonth.getFullYear(),
          nextMonth.getMonth() + 1,
          0,
        ).getDate();
        const dueDay = lastDayOfNextMonth - 1;
        const dueDate = new Date(
          nextMonth.getFullYear(),
          nextMonth.getMonth(),
          dueDay,
        );
        const dueDateStr =
          `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdueDays = Math.floor(
          (today.getTime() - dueDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        if (overdueDays < 0) return null;

        const totalElectricityFee = Number(
          item.totalElectricityFee,
        );
        const totalWaterFee = Number(item.totalWaterFee);
        const electricityReceived = Number(
          item.electricityReceived,
        );
        const waterReceived = Number(item.waterReceived);
        const propId = item.contractId
          ? contractPropertyMap.get(item.contractId)
          : undefined;

        return {
          contractNo: item.contractNo,
          propertyName: propId
            ? propertyNameOf.get(propId)
            : undefined,
          period: item.period,
          totalElectricityFee,
          totalWaterFee,
          unpaidElectricity:
            totalElectricityFee - electricityReceived,
          unpaidWater: totalWaterFee - waterReceived,
          dueDate: dueDateStr,
          overdueDays,
          tenant: item.tenant,
          contractId: item.contractId,
        };
      })
      .filter(
        (item): item is UtilityOverdueItem => item !== null,
      );

    return { data, followerIds };
  }

  async getUtilityUnregistered(): Promise<{
    data: UtilityUnregisteredGroup[];
    followerIds: string[];
  }> {
    const config = await this.db
      .select()
      .from(overdueConfigs)
      .where(
        eq(overdueConfigs.configType, 'utility_unregistered'),
      );

    const followerIds: string[] = config[0]?.followerIds ?? [];

    const approvedContracts = await this.db
      .select({
        id: contracts.id,
        contractNo: contracts.contractNo,
        tenant: contracts.tenant,
        propertyId: contracts.propertyId,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.hasUtilities, true),
          eq(contracts.status, 'approved'),
        ),
      );

    // 已登记集合：按 租户::房产::期间 判断（与水电费管理页登记口径一致）
    const registeredRecords = await this.db
      .select({
        contractId: utilityRecords.contractId,
        period: utilityRecords.period,
        tenant: contracts.tenant,
        propertyId: contracts.propertyId,
      })
      .from(utilityRecords)
      .leftJoin(contracts, eq(utilityRecords.contractId, contracts.id));

    const registeredTenantPeriods = new Set<string>();
    for (const rec of registeredRecords) {
      registeredTenantPeriods.add(
        `${rec.tenant ?? ''}::${rec.propertyId ?? ''}::${rec.period}`,
      );
    }

    const now = new Date();
    const currentMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    );

    // 房产名实时查询（contracts 表仅存 propertyId）
    const propertyIds = [
      ...new Set(
        approvedContracts
          .map((c) => c.propertyId)
          .filter((pid): pid is string => !!pid),
      ),
    ];
    const propertyMap = new Map<string, string>();
    if (propertyIds.length > 0) {
      const propRows = await this.db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(inArray(properties.id, propertyIds));
      for (const p of propRows) {
        propertyMap.set(p.id, p.name);
      }
    }

    // 按 租户+房产 分组（同租户同房产的多份合同合并去重，跨房产分开展示——与水电费管理页口径一致）
    const groupMap = new Map<
      string,
      { tenant: string; propertyName?: string; periods: string[] }
    >();

    for (const contract of approvedContracts) {
      const start = new Date(contract.startDate);
      const end = new Date(
        Math.min(
          new Date(contract.endDate).getTime(),
          new Date(
            currentMonthStart.getFullYear(),
            currentMonthStart.getMonth() - 1,
            1,
          ).getTime(),
        ),
      );

      // 未登记检查起点：2026-01 起算（早于该月的期间不再纳入未登记统计）
      const minCheckStart = new Date(2026, 0, 1);
      const unregisteredPeriods: string[] = [];
      const cursor = new Date(
        Math.max(
          new Date(start.getFullYear(), start.getMonth(), 1).getTime(),
          minCheckStart.getTime(),
        ),
      );

      while (cursor <= end) {
        const periodStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

        if (
          !registeredTenantPeriods.has(
            `${contract.tenant}::${contract.propertyId ?? ''}::${periodStr}`,
          )
        ) {
          unregisteredPeriods.push(periodStr);
        }

        cursor.setMonth(cursor.getMonth() + 1);
      }

      if (unregisteredPeriods.length > 0) {
        this.logger.log(
          `水电费未登记检查: 合同${contract.contractNo}, 承租方${contract.tenant}, 未登记月份[${unregisteredPeriods.join(', ')}]`,
        );
        const key = `${contract.tenant}::${contract.propertyId ?? ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            tenant: contract.tenant,
            propertyName: contract.propertyId
              ? propertyMap.get(contract.propertyId)
              : undefined,
            periods: [],
          });
        }
        groupMap.get(key)!.periods.push(...unregisteredPeriods);
      }
    }

    const data: UtilityUnregisteredGroup[] = [];
    for (const [, group] of groupMap) {
      const uniquePeriods = [...new Set(group.periods)].sort();
      data.push({
        tenant: group.tenant,
        propertyName: group.propertyName,
        unregisteredPeriods: uniquePeriods.join(', '),
        unregisteredCount: uniquePeriods.length,
      });
    }

    return { data, followerIds };
  }

  async sendReminder(
    type: 'rent' | 'utility' | 'utility_unregistered',
  ): Promise<{ success: boolean; count: number }> {
    const config = await this.db
      .select()
      .from(overdueConfigs)
      .where(eq(overdueConfigs.configType, type));

    if (config.length === 0) {
      throw new BadRequestException(
        `未找到类型 ${type} 的逾期配置`,
      );
    }

    const followerIds: string[] = config[0]?.followerIds ?? [];
    if (followerIds.length === 0) {
      this.logger.warn(`类型 ${type} 未配置跟进人员，跳过发送`);
      return { success: true, count: 0 };
    }

    let rentPropertyOverdueDetail = '无';
    let utilityOverdueDetail = '无';
    let utilityUnregisteredSummary = '无';
    let count = 0;

    if (type === 'rent') {
      const { data } = await this.getRentOverdue();
      count = data.length;
      if (data.length > 0) {
        rentPropertyOverdueDetail = data
          .map(
            (item) =>
              `承租方${item.tenant} ${item.period}: ` +
              `欠租金${item.unpaidRent.toFixed(2)} ` +
              `欠物业费${item.unpaidPropertyFee.toFixed(2)} ` +
              `逾期${item.overdueDays}天`,
          )
          .join('\n');
      }
    } else if (type === 'utility') {
      const { data } = await this.getUtilityOverdue();
      count = data.length;
      if (data.length > 0) {
        utilityOverdueDetail = data
          .map(
            (item) =>
              `承租方${item.tenant} ${item.period}: ` +
              `欠电费${item.unpaidElectricity.toFixed(2)} ` +
              `欠水费${item.unpaidWater.toFixed(2)} ` +
              `逾期${item.overdueDays}天`,
          )
          .join('\n');
      }
    } else if (type === 'utility_unregistered') {
      const { data } = await this.getUtilityUnregistered();
      count = data.reduce(
        (sum, g) => sum + g.unregisteredCount,
        0,
      );
      if (data.length > 0) {
        utilityUnregisteredSummary = data
          .map(
            (g) =>
              `租户${g.tenant}${g.propertyName ? `(${g.propertyName})` : ''}: 未登记${g.unregisteredCount}期(${g.unregisteredPeriods})`,
          )
          .join('\n');
      }
    }

    try {
      await this.capabilityService
        .load('send_feishu_overdue_notification_1')
        .call('send_feishu_message', {
          follower_user_ids: followerIds,
          rent_property_overdue_detail:
            rentPropertyOverdueDetail,
          utility_overdue_detail: utilityOverdueDetail,
          utility_unregistered_summary:
            utilityUnregisteredSummary,
        });

      this.logger.log(
        `逾期提醒发送成功: 类型=${type}, 数量=${count}`,
      );
      return { success: true, count };
    } catch (error) {
      this.logger.error(
        `逾期提醒发送失败: 类型=${type}`,
        error as Error,
      );
      throw error;
    }
  }
  async sendAllReminders(): Promise<{ success: boolean; count: number }> {
    const allConfigs = await this.db
      .select()
      .from(overdueConfigs);

    const allFollowerIds = new Set<string>();
    for (const c of allConfigs) {
      for (const id of (c.followerIds ?? [])) {
        allFollowerIds.add(id);
      }
    }

    if (allFollowerIds.size === 0) {
      this.logger.warn('所有类型均未配置跟进人员，跳过发送');
      return { success: true, count: 0 };
    }

    let rentPropertyOverdueDetail = '无';
    let utilityOverdueDetail = '无';
    let utilityUnregisteredSummary = '无';
    let count = 0;

    const [rentResult, utilityResult, unregisteredResult] = await Promise.all([
      this.getRentOverdue(),
      this.getUtilityOverdue(),
      this.getUtilityUnregistered(),
    ]);

    if (rentResult.data.length > 0) {
      count += rentResult.data.length;
      rentPropertyOverdueDetail = rentResult.data
        .map(
          (item) =>
            `承租方${item.tenant} ${item.period}: ` +
            `欠租金${item.unpaidRent.toFixed(2)} ` +
            `欠物业费${item.unpaidPropertyFee.toFixed(2)} ` +
            `逾期${item.overdueDays}天`,
        )
        .join('\n');
    }

    if (utilityResult.data.length > 0) {
      count += utilityResult.data.length;
      utilityOverdueDetail = utilityResult.data
        .map(
          (item) =>
            `承租方${item.tenant} ${item.period}: ` +
            `欠电费${item.unpaidElectricity.toFixed(2)} ` +
            `欠水费${item.unpaidWater.toFixed(2)} ` +
            `逾期${item.overdueDays}天`,
        )
        .join('\n');
    }

    if (unregisteredResult.data.length > 0) {
      const unregisteredCount = unregisteredResult.data.reduce(
        (sum, g) => sum + g.unregisteredCount,
        0,
      );
      count += unregisteredCount;
      utilityUnregisteredSummary = unregisteredResult.data
        .map(
          (g) =>
            `租户${g.tenant}${g.propertyName ? `(${g.propertyName})` : ''}: 未登记${g.unregisteredCount}期(${g.unregisteredPeriods})`,
        )
        .join('\n');
    }

    try {
      await this.capabilityService
        .load('send_feishu_overdue_notification_1')
        .call('send_feishu_message', {
          follower_user_ids: [...allFollowerIds],
          rent_property_overdue_detail: rentPropertyOverdueDetail,
          utility_overdue_detail: utilityOverdueDetail,
          utility_unregistered_summary: utilityUnregisteredSummary,
        });

      this.logger.log(
        `全部逾期提醒发送成功: 总数量=${count}, 接收人=${allFollowerIds.size}人`,
      );
      return { success: true, count };
    } catch (error) {
      this.logger.error('全部逾期提醒发送失败', error as Error);
      throw error;
    }
  }
}
