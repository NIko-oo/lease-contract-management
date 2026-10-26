import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { contracts, ledgerItems, userColumnConfigs, customers, receiveRecords } from '@server/database/schema';
import { eq, and, or, count, desc, asc, ilike, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type {
  LedgerItem,
  LedgerListQuery,
  LedgerListResp,
  ColumnConfigResp,
  LedgerUnpaidPeriodItem,
} from '@shared/api.interface';

const round2 = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class LedgerService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async findAll(params: LedgerListQuery): Promise<LedgerListResp> {
    const {
      contractId,
      contractNo,
      period,
      status,
      tenant,
      propertyName,
      overdue,
      page = 1,
      pageSize = 20,
    } = params;

    const conditions = [];
    if (contractId) {
      conditions.push(eq(ledgerItems.contractId, contractId));
    }
    if (contractNo) {
      conditions.push(ilike(ledgerItems.contractNo, `%${contractNo}%`));
    }
    if (period) {
      conditions.push(eq(ledgerItems.period, period));
    }
    if (status && status.length > 0) {
      if (status.length === 1) {
        conditions.push(eq(ledgerItems.status, status[0]));
      } else {
        conditions.push(inArray(ledgerItems.status, status));
      }
    }
    if (tenant) {
      conditions.push(ilike(ledgerItems.tenant, `%${tenant}%`));
    }
    if (propertyName) {
      conditions.push(ilike(ledgerItems.propertyName, `%${propertyName}%`));
    }
    if (overdue === true) {
      conditions.push(
        sql`${ledgerItems.dueDate} < CURRENT_DATE::text`,
        notInArray(ledgerItems.status, [
          'paid',
          'terminated',
          'no_payment_required',
        ]),
      );
    } else if (overdue === false) {
      conditions.push(
        or(
          sql`${ledgerItems.dueDate} >= CURRENT_DATE::text`,
          inArray(ledgerItems.status, [
            'paid',
            'terminated',
            'no_payment_required',
          ]),
        )!,
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult, totalsResult] = await Promise.all([
      this.db
        .select()
        .from(ledgerItems)
        .where(whereClause)
        .orderBy(asc(ledgerItems.contractNo), asc(ledgerItems.period))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(ledgerItems)
        .where(whereClause),
      // 全量聚合合计：应收口径与前端一致（变更值优先，无变更取合同值）
      this.db
        .select({
          monthlyRent: sql<number>`COALESCE(SUM(${ledgerItems.monthlyRent}), 0)`,
          monthlyPropertyFee: sql<number>`COALESCE(SUM(${ledgerItems.monthlyPropertyFee}), 0)`,
          amendmentRent: sql<number>`COALESCE(SUM(${ledgerItems.amendmentRent}), 0)`,
          amendmentPropertyFee: sql<number>`COALESCE(SUM(${ledgerItems.amendmentPropertyFee}), 0)`,
          receivableRent: sql<number>`COALESCE(SUM(COALESCE(${ledgerItems.amendmentRent}, ${ledgerItems.monthlyRent})), 0)`,
          receivablePropertyFee: sql<number>`COALESCE(SUM(COALESCE(${ledgerItems.amendmentPropertyFee}, ${ledgerItems.monthlyPropertyFee})), 0)`,
          rentReceived: sql<number>`COALESCE(SUM(${ledgerItems.rentReceived}), 0)`,
          propertyFeeReceived: sql<number>`COALESCE(SUM(${ledgerItems.propertyFeeReceived}), 0)`,
        })
        .from(ledgerItems)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totals = totalsResult[0];

    // 租户编码：按租户名称精确匹配 customers.companyName 带出（当前页数据量小，二次查询）
    const items = itemsResult as unknown as LedgerItem[];
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
    // 租赁面积：按 contractId 从合同表批量带出（合同级单值，不改台账表结构）
    let leaseAreas = new Map<string, number | null>();
    const contractIds = [...new Set(items.map((it) => it.contractId).filter(Boolean))];
    if (contractIds.length > 0) {
      const contractRows = await this.db
        .select({
          id: contracts.id,
          leaseArea: contracts.leaseArea,
        })
        .from(contracts)
        .where(inArray(contracts.id, contractIds));
      leaseAreas = new Map(
        contractRows.map((c) => [c.id, c.leaseArea ?? null]),
      );
    }
    const itemsWithCode = items.map((it) => ({
      ...it,
      customerCode: customerCodes.get(it.tenant) ?? undefined,
      leaseArea: leaseAreas.get(it.contractId) ?? undefined,
    }));

    return {
      items: itemsWithCode as LedgerItem[],
      total,
      page,
      pageSize,
      totals: {
        monthlyRent: totals?.monthlyRent ?? 0,
        monthlyPropertyFee: totals?.monthlyPropertyFee ?? 0,
        amendmentRent: totals?.amendmentRent ?? 0,
        amendmentPropertyFee: totals?.amendmentPropertyFee ?? 0,
        receivableRent: totals?.receivableRent ?? 0,
        receivablePropertyFee: totals?.receivablePropertyFee ?? 0,
        rentReceived: totals?.rentReceived ?? 0,
        propertyFeeReceived: totals?.propertyFeeReceived ?? 0,
      },
    };
  }

  /**
   * 该合同未收齐台账期间（供收款弹窗所属期下拉 + 期级余额）
   * 期级口径：应收 = 该期全部未终止行之和，已收 = receive_records 该期聚合。
   * 一个所属期可能有多行（月中阶段拆分 / 变更生效），按行取数会让弹窗的应收与
   * 后端校验的已收落在不同维度上，同月多行时必然误判超收。
   */
  async getUnpaidPeriods(
    contractId?: string,
  ): Promise<LedgerUnpaidPeriodItem[]> {
    if (!contractId) {
      return [];
    }
    const [ledgerRows, receiptRows] = await Promise.all([
      this.db
        .select({
          period: ledgerItems.period,
          monthlyRent: ledgerItems.monthlyRent,
          monthlyPropertyFee: ledgerItems.monthlyPropertyFee,
          amendmentRent: ledgerItems.amendmentRent,
          amendmentPropertyFee: ledgerItems.amendmentPropertyFee,
        })
        .from(ledgerItems)
        .where(
          and(
            eq(ledgerItems.contractId, contractId),
            ne(ledgerItems.status, 'terminated'),
          ),
        ),
      this.db
        .select({
          period: receiveRecords.period,
          receiveType: receiveRecords.receiveType,
          total: sql<number>`coalesce(sum(${receiveRecords.amount}), 0)`,
        })
        .from(receiveRecords)
        .where(
          and(
            eq(receiveRecords.contractId, contractId),
            inArray(receiveRecords.receiveType, ['rent', 'property_fee']),
          ),
        )
        .groupBy(receiveRecords.period, receiveRecords.receiveType),
    ]);

    const byPeriod = new Map<string, LedgerUnpaidPeriodItem>();
    const ensure = (period: string): LedgerUnpaidPeriodItem => {
      const cur = byPeriod.get(period) ?? {
        period,
        receivableRent: 0,
        receivablePropertyFee: 0,
        rentReceived: 0,
        propertyFeeReceived: 0,
      };
      byPeriod.set(period, cur);
      return cur;
    };

    for (const row of ledgerRows) {
      const bal = ensure(row.period);
      bal.receivableRent +=
        row.amendmentRent != null
          ? Number(row.amendmentRent)
          : Number(row.monthlyRent);
      bal.receivablePropertyFee +=
        row.amendmentPropertyFee != null
          ? Number(row.amendmentPropertyFee)
          : Number(row.monthlyPropertyFee);
    }
    for (const row of receiptRows) {
      const bal = ensure(row.period);
      if (row.receiveType === 'rent') {
        bal.rentReceived += Number(row.total);
      } else if (row.receiveType === 'property_fee') {
        bal.propertyFeeReceived += Number(row.total);
      }
    }

    return [...byPeriod.values()]
      .map((bal) => ({
        ...bal,
        receivableRent: round2(bal.receivableRent),
        receivablePropertyFee: round2(bal.receivablePropertyFee),
        rentReceived: round2(bal.rentReceived),
        propertyFeeReceived: round2(bal.propertyFeeReceived),
      }))
      .filter(
        (p) =>
          p.rentReceived < p.receivableRent ||
          p.propertyFeeReceived < p.receivablePropertyFee,
      )
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  async getColumnConfig(userId: string): Promise<ColumnConfigResp> {
    const result = await this.db
      .select({ hiddenColumns: userColumnConfigs.hiddenColumns })
      .from(userColumnConfigs)
      .where(
        and(
          eq(userColumnConfigs.userId, userId),
          eq(userColumnConfigs.pageName, 'ledger'),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return { hiddenColumns: [] };
    }

    const cols = result[0].hiddenColumns;
    return { hiddenColumns: cols.filter((c: string) => c !== '') };
  }

  async saveColumnConfig(userId: string, hiddenColumns: string[]): Promise<ColumnConfigResp> {
    await this.db
      .insert(userColumnConfigs)
      .values({
        userId,
        pageName: 'ledger',
        hiddenColumns,
      })
      .onConflictDoUpdate({
        target: [userColumnConfigs.userId, userColumnConfigs.pageName],
        set: { hiddenColumns },
      });

    return { hiddenColumns };
  }
}
