import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  receiveRecords,
  ledgerItems,
  utilityRecords,
  contracts,
  properties,
  customers,
} from '@server/database/schema';
import { eq, and, or, count, asc, ilike, inArray, gte, lte, sql } from 'drizzle-orm';
import type {
  ReceiveRecord,
  ReceiveType,
  CreateReceiveDto,
  CreateReceiveItemDto,
  ReceiveListQuery,
  ReceiveListResp,
} from '@shared/api.interface';

type Tx = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];

/** 单位元数据：租金=面积、物业费=月、水=吨、电=度 */
const UNIT_BY_TYPE: Record<ReceiveType, string> = {
  rent: '面积',
  property_fee: '月',
  water: '吨',
  electricity: '度',
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 期级应收：该期若干台账行的应收之和（amendment 非 null 才回落原值） */
type ReceivableSource = {
  amendmentRent: number | string | null;
  monthlyRent: number | string;
  amendmentPropertyFee: number | string | null;
  monthlyPropertyFee: number | string;
};
const rowRent = (row: ReceivableSource): number =>
  row.amendmentRent != null ? Number(row.amendmentRent) : Number(row.monthlyRent);
const rowPropertyFee = (row: ReceivableSource): number =>
  row.amendmentPropertyFee != null
    ? Number(row.amendmentPropertyFee)
    : Number(row.monthlyPropertyFee);
const periodReceivable = (rows: ReceivableSource[]) => ({
  rent: round2(rows.reduce((s, r) => s + rowRent(r), 0)),
  propertyFee: round2(rows.reduce((s, r) => s + rowPropertyFee(r), 0)),
});

/** 把期级已收按行顺序分摊：逐行填满自身应收，剩余（历史超收才会出现）落到最后一行 */
const allocateToRows = (total: number, caps: number[]): number[] => {
  const result: number[] = [];
  let left = round2(total);
  for (const cap of caps) {
    const take = round2(Math.min(Math.max(left, 0), cap));
    result.push(take);
    left = round2(left - take);
  }
  if (left > 0 && result.length > 0) {
    result[result.length - 1] = round2(result[result.length - 1] + left);
  }
  return result;
};

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async findAll(params: ReceiveListQuery): Promise<ReceiveListResp> {
    const {
      propertyName,
      contractNo,
      keyword,
      receiveType,
      receiveStart,
      receiveEnd,
      period,
      contractId,
      refId,
      page = 1,
      pageSize = 20,
    } = params;

    const conditions = [];
    if (propertyName) {
      conditions.push(ilike(receiveRecords.propertyName, `%${propertyName}%`));
    }
    if (contractNo) {
      conditions.push(ilike(receiveRecords.contractNo, `%${contractNo}%`));
    }
    if (keyword) {
      conditions.push(
        or(
          ilike(receiveRecords.tenant, `%${keyword}%`),
          ilike(receiveRecords.customerCode, `%${keyword}%`),
        ),
      );
    }
    if (receiveType) {
      conditions.push(eq(receiveRecords.receiveType, receiveType));
    }
    if (receiveStart) {
      conditions.push(gte(receiveRecords.receiveDate, receiveStart));
    }
    if (receiveEnd) {
      conditions.push(lte(receiveRecords.receiveDate, receiveEnd));
    }
    if (period) {
      conditions.push(eq(receiveRecords.period, period));
    }
    if (contractId) {
      conditions.push(eq(receiveRecords.contractId, contractId));
    }
    if (refId) {
      conditions.push(eq(receiveRecords.refId, refId));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    const [itemsResult, countResult, totalsResult] = await Promise.all([
      this.db
        .select()
        .from(receiveRecords)
        .where(whereClause)
        .orderBy(
          asc(receiveRecords.contractNo),
          asc(receiveRecords.period),
          asc(receiveRecords.receiveDate),
        )
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(receiveRecords)
        .where(whereClause),
      // 全量聚合合计（按当前筛选条件统计）
      this.db
        .select({
          amount: sql<number>`COALESCE(SUM(${receiveRecords.amount}), 0)`,
          unitQty: sql<number>`COALESCE(SUM(${receiveRecords.unitQty}), 0)`,
        })
        .from(receiveRecords)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totals = totalsResult[0];

    return {
      items: itemsResult as unknown as ReceiveRecord[],
      total,
      page,
      pageSize,
      totals: {
        amount: totals?.amount ?? 0,
        unitQty: totals?.unitQty ?? 0,
      },
    };
  }

  async create(
    dto: CreateReceiveDto,
    userId: string,
  ): Promise<ReceiveRecord[]> {
    const { refType, refId, items } = dto;

    if (!items || items.length === 0) {
      throw new BadRequestException('至少录入一条收款记录');
    }
    for (const item of items) {
      if (!item.amount || item.amount <= 0) {
        throw new BadRequestException('收款金额必须大于 0');
      }
      if (!item.receiveDate) {
        throw new BadRequestException('收款日期必填');
      }
      if (!item.period) {
        throw new BadRequestException('款项所属期必填');
      }
    }

    if (refType === 'ledger') {
      return this.createFromLedger(refId, items, userId);
    }
    return this.createFromUtility(refId, items, userId);
  }

  private async createFromLedger(
    refId: string,
    items: CreateReceiveItemDto[],
    userId: string,
  ): Promise<ReceiveRecord[]> {
    for (const item of items) {
      if (item.receiveType !== 'rent' && item.receiveType !== 'property_fee') {
        throw new BadRequestException('台账收款仅支持租金/物业费类型');
      }
    }

    const srcRows = await this.db
      .select()
      .from(ledgerItems)
      .where(eq(ledgerItems.id, refId))
      .limit(1);
    if (srcRows.length === 0) {
      throw new NotFoundException('台账记录不存在');
    }
    const source = srcRows[0];
    if (source.status === 'terminated') {
      throw new BadRequestException(
        '该台账记录所属期已在合同终止后，不可录入收款',
      );
    }

    // 一次提交可覆盖多个所属期：逐期校验应收上限 + 回写
    const periods = [...new Set(items.map((it) => it.period))];

    const periodRows = await this.db
      .select()
      .from(ledgerItems)
      .where(
        and(
          eq(ledgerItems.contractId, source.contractId),
          inArray(ledgerItems.period, periods),
        ),
      );
    // 期级口径：一个所属期可有多行（月中阶段拆分 / 变更生效），应收取该期未终止行之和
    const rowsByPeriod = new Map<string, typeof periodRows>();
    for (const r of periodRows) {
      const list = rowsByPeriod.get(r.period) ?? [];
      list.push(r);
      rowsByPeriod.set(r.period, list);
    }
    const receivableByPeriod = new Map<string, { rent: number; propertyFee: number }>();
    for (const p of periods) {
      const all = rowsByPeriod.get(p) ?? [];
      const active = all.filter((r) => r.status !== 'terminated');
      if (active.length === 0) {
        throw new BadRequestException(
          all.length > 0
            ? `台账期间 ${p} 已在合同终止后，不可录入收款`
            : `台账期间 ${p} 不存在`,
        );
      }
      receivableByPeriod.set(p, periodReceivable(active));
    }

    // 已有收款（按期间聚合）
    const aggByPeriod = await this.aggregateReceiveByPeriods(
      source.contractId,
      periods,
    );

    // 校验：该期间该类型（本次合计 + 已有）不得超该期应收合计
    for (const p of periods) {
      const receivable = receivableByPeriod.get(p)!;

      const rentTotal = items
        .filter((it) => it.period === p && it.receiveType === 'rent')
        .reduce((sum, it) => sum + Number(it.amount), 0);
      const feeTotal = items
        .filter((it) => it.period === p && it.receiveType === 'property_fee')
        .reduce((sum, it) => sum + Number(it.amount), 0);

      const agg = aggByPeriod.get(p) ?? {};
      if ((agg.rent ?? 0) + rentTotal > receivable.rent) {
        throw new BadRequestException(
          `${p} 已收租金不能超过应收租金 ${receivable.rent}`,
        );
      }
      if ((agg.property_fee ?? 0) + feeTotal > receivable.propertyFee) {
        throw new BadRequestException(
          `${p} 已收物业费不能超过应收物业费 ${receivable.propertyFee}`,
        );
      }
    }

    const contract = await this.loadContractWithCustomer(
      source.contractId,
      source.tenant,
    );

    const rowsToInsert = items.map((it) => {
      // 物业费单位数量 = 该期「月数」，分母取该期应收合计（多行时一个月仍是 1 月）
      const periodPropertyFee =
        receivableByPeriod.get(it.period)!.propertyFee;
      const unitQty =
        it.receiveType === 'rent'
          ? contract.leaseArea ?? 0
          : round2(Number(it.amount) / (periodPropertyFee || 1));
      return {
        propertyName: source.propertyName ?? contract.propertyName,
        contractId: source.contractId,
        contractNo: source.contractNo,
        tenant: source.tenant,
        customerCode: contract.customerCode,
        receiveType: it.receiveType,
        receiveDate: it.receiveDate,
        period: it.period,
        unit: UNIT_BY_TYPE[it.receiveType],
        unitQty,
        amount: Number(it.amount),
        invoiceNo: it.invoiceNo || null,
        refId: source.id,
        createdBy: userId,
        updatedBy: userId,
      };
    });

    const inserted = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(receiveRecords)
        .values(rowsToInsert)
        .returning();

      for (const p of periods) {
        await this.syncBack(source.contractId, p, userId, tx);
      }

      return inserted;
    });

    return inserted as unknown as ReceiveRecord[];
  }

  private async createFromUtility(
    refId: string,
    items: CreateReceiveItemDto[],
    userId: string,
  ): Promise<ReceiveRecord[]> {
    const srcRows = await this.db
      .select()
      .from(utilityRecords)
      .where(eq(utilityRecords.id, refId))
      .limit(1);
    if (srcRows.length === 0) {
      throw new NotFoundException('水电费记录不存在');
    }
    const source = srcRows[0];

    const waterItems = items.filter((it) => it.receiveType === 'water');
    const electricityItems = items.filter(
      (it) => it.receiveType === 'electricity',
    );
    if (waterItems.length + electricityItems.length !== items.length) {
      throw new BadRequestException('水电费收款仅支持水费/电费类型');
    }
    for (const it of items) {
      if (it.period !== source.period) {
        throw new BadRequestException('水电费收款所属期必须与记录所属期一致');
      }
    }

    const pendingWater = waterItems.reduce(
      (sum, it) => sum + Number(it.amount),
      0,
    );
    const pendingElectricity = electricityItems.reduce(
      (sum, it) => sum + Number(it.amount),
      0,
    );
    // 超收校验按累计口径：已收（receive_records 事实源）+ 本次 ≤ 应收，与台账收款同构
    const existing = await this.aggregateReceive(source.contractId, source.period);
    const existingWater = existing.water ?? 0;
    const existingElectricity = existing.electricity ?? 0;
    if (existingWater + pendingWater > Number(source.totalWaterFee)) {
      throw new BadRequestException(
        `已收水费（${existingWater}）加本次（${pendingWater}）不能超过应收水费 ${source.totalWaterFee}`,
      );
    }
    if (existingElectricity + pendingElectricity > Number(source.totalElectricityFee)) {
      throw new BadRequestException(
        `已收电费（${existingElectricity}）加本次（${pendingElectricity}）不能超过应收电费 ${source.totalElectricityFee}`,
      );
    }

    const contract = await this.loadContractWithCustomer(
      source.contractId,
      source.tenant,
    );

    const rowsToInsert = items.map((it) => {
      const price =
        it.receiveType === 'water'
          ? Number(source.waterPrice)
          : Number(source.electricityPrice);
      return {
        propertyName: contract.propertyName,
        contractId: source.contractId,
        contractNo: source.contractNo,
        tenant: source.tenant,
        customerCode: contract.customerCode,
        receiveType: it.receiveType,
        receiveDate: it.receiveDate,
        period: source.period,
        unit: UNIT_BY_TYPE[it.receiveType],
        unitQty: round2(Number(it.amount) / (price || 1)),
        amount: Number(it.amount),
        invoiceNo: it.invoiceNo || null,
        refId: source.id,
        createdBy: userId,
        updatedBy: userId,
      };
    });

    const inserted = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(receiveRecords)
        .values(rowsToInsert)
        .returning();

      await this.syncBack(source.contractId, source.period, userId, tx);
      return inserted;
    });

    return inserted as unknown as ReceiveRecord[];
  }

  async remove(id: string, userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(receiveRecords)
      .where(eq(receiveRecords.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('收款记录不存在');
    }
    const row = rows[0];

    await this.db.transaction(async (tx) => {
      await tx.delete(receiveRecords).where(eq(receiveRecords.id, id));
      await this.syncBack(row.contractId, row.period, userId, tx);
    });
  }

  async updateInvoice(
    id: string,
    invoiceNo: string,
    userId: string,
  ): Promise<ReceiveRecord> {
    const rows = await this.db
      .select()
      .from(receiveRecords)
      .where(eq(receiveRecords.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('收款记录不存在');
    }

    await this.db
      .update(receiveRecords)
      .set({
        invoiceNo: invoiceNo || null,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(receiveRecords.id, id));

    const updated = await this.db
      .select()
      .from(receiveRecords)
      .where(eq(receiveRecords.id, id))
      .limit(1);

    return updated[0] as unknown as ReceiveRecord;
  }

  /** 按 (contractId, period) 聚合已有收款 */
  private async aggregateReceive(
    contractId: string,
    period: string,
    tx?: Tx,
  ): Promise<Partial<Record<ReceiveType, number>>> {
    const db = tx ?? this.db;
    const rows = await db
      .select({
        receiveType: receiveRecords.receiveType,
        total: sql<number>`coalesce(sum(${receiveRecords.amount}), 0)`,
      })
      .from(receiveRecords)
      .where(
        and(
          eq(receiveRecords.contractId, contractId),
          eq(receiveRecords.period, period),
        ),
      )
      .groupBy(receiveRecords.receiveType);

    const result: Partial<Record<ReceiveType, number>> = {};
    for (const row of rows) {
      result[row.receiveType as ReceiveType] = Number(row.total);
    }
    return result;
  }

  /** 按期间批量聚合已有收款 */
  private async aggregateReceiveByPeriods(
    contractId: string,
    periods: string[],
  ): Promise<Map<string, Partial<Record<ReceiveType, number>>>> {
    const rows = await this.db
      .select({
        period: receiveRecords.period,
        receiveType: receiveRecords.receiveType,
        total: sql<number>`coalesce(sum(${receiveRecords.amount}), 0)`,
      })
      .from(receiveRecords)
      .where(
        and(
          eq(receiveRecords.contractId, contractId),
          inArray(receiveRecords.period, periods),
        ),
      )
      .groupBy(receiveRecords.period, receiveRecords.receiveType);

    const result = new Map<string, Partial<Record<ReceiveType, number>>>();
    for (const row of rows) {
      const item = result.get(row.period) ?? {};
      item[row.receiveType as ReceiveType] = Number(row.total);
      result.set(row.period, item);
    }
    return result;
  }

  /** 回写同步（DB 部分）：按 (contractId, period) 聚合收款重写台账/水电记录 */
  private async syncBack(
    contractId: string,
    period: string,
    updater: string,
    tx?: Tx,
  ): Promise<void> {
    const db = tx ?? this.db;
    const agg = await this.aggregateReceive(contractId, period, tx);
    const receiveDate = await this.maxReceiveDate(contractId, period, tx);

    // 回写台账（租金/物业费）：期级已收按阶段起始日升序逐行分摊，已终止行不参与
    const periodLedgerRows = await db
      .select()
      .from(ledgerItems)
      .where(
        and(
          eq(ledgerItems.contractId, contractId),
          eq(ledgerItems.period, period),
        ),
      )
      .orderBy(asc(ledgerItems.stageStartDate));
    const activeRows = periodLedgerRows.filter((r) => r.status !== 'terminated');
    if (activeRows.length > 0) {
      const rentByRow = allocateToRows(
        agg.rent ?? 0,
        activeRows.map(rowRent),
      );
      const feeByRow = allocateToRows(
        agg.property_fee ?? 0,
        activeRows.map(rowPropertyFee),
      );
      for (let i = 0; i < activeRows.length; i++) {
        const item = activeRows[i];
        const receivableRent = rowRent(item);
        const receivablePropertyFee = rowPropertyFee(item);
        const rentReceived = rentByRow[i];
        const propertyFeeReceived = feeByRow[i];

        let newStatus: 'unpaid' | 'partial' | 'paid' | 'no_payment_required' =
          'unpaid';
        if (receivableRent === 0 && receivablePropertyFee === 0) {
          newStatus = 'no_payment_required';
        } else if (rentReceived >= receivableRent && propertyFeeReceived >= receivablePropertyFee) {
          newStatus = 'paid';
        } else if (rentReceived > 0 || propertyFeeReceived > 0) {
          newStatus = 'partial';
        }

        await db
          .update(ledgerItems)
          .set({
            rentReceived,
            propertyFeeReceived,
            receiveDate,
            status: newStatus,
            updatedAt: new Date(),
            updatedBy: updater,
          })
          .where(eq(ledgerItems.id, item.id));
      }
    }

    // 回写水电费（水/电）
    const utilityRows = await db
      .select()
      .from(utilityRecords)
      .where(
        and(
          eq(utilityRecords.contractId, contractId),
          eq(utilityRecords.period, period),
        ),
      )
      .limit(1);
    if (utilityRows.length > 0) {
      const record = utilityRows[0];

      await db
        .update(utilityRecords)
        .set({
          electricityReceived: agg.electricity ?? 0,
          waterReceived: agg.water ?? 0,
          receiveDate,
          updatedAt: new Date(),
        })
        .where(eq(utilityRecords.id, record.id));
    }
  }

  /** 同合同同期间收款日最大值 */
  private async maxReceiveDate(
    contractId: string,
    period: string,
    tx?: Tx,
  ): Promise<string | null> {
    const db = tx ?? this.db;
    const rows = await db
      .select({
        maxDate: sql<string | null>`max(${receiveRecords.receiveDate})`,
      })
      .from(receiveRecords)
      .where(
        and(
          eq(receiveRecords.contractId, contractId),
          eq(receiveRecords.period, period),
        ),
      );
    return rows[0]?.maxDate ?? null;
  }

  /** 合同房产名 + 按租户名称匹配客户编码 */
  private async loadContractWithCustomer(
    contractId: string,
    tenant: string,
  ): Promise<{
    propertyName: string | null;
    leaseArea: number | null;
    customerCode: string | null;
  }> {
    const contractRows = await this.db
      .select({
        propertyName: properties.name,
        leaseArea: contracts.leaseArea,
      })
      .from(contracts)
      .leftJoin(properties, eq(contracts.propertyId, properties.id))
      .where(eq(contracts.id, contractId))
      .limit(1);

    const propertyName = contractRows[0]?.propertyName ?? null;
    const leaseArea =
      contractRows[0]?.leaseArea != null ? Number(contractRows[0].leaseArea) : null;

    // 租户编码：按租户名称精确匹配 customers.companyName，匹配不到留空不阻断
    const customerRows = await this.db
      .select({ customerCode: customers.customerCode })
      .from(customers)
      .where(eq(customers.companyName, tenant))
      .limit(1);

    return {
      propertyName,
      leaseArea,
      customerCode: customerRows[0]?.customerCode ?? null,
    };
  }
}