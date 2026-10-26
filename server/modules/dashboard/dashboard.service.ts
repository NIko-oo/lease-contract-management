import { Injectable, Inject } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { properties, contracts, ledgerItems } from '@server/database/schema';
import { and, gte, lte, ne, asc } from 'drizzle-orm';
import type {
  PropertyRentSummaryResp,
  PropertyRentSummaryItem,
} from '@shared/api.interface';

/** 当月天数（m 为 1~12） */
function daysInMonth(year: number, m: number): number {
  return new Date(year, m, 0).getDate();
}

/** 保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 保留 4 位小数 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * 数据看板 - 房产出租概况（第 1 卡片）
   * GET /api/dashboard/property-rent-summary?year=2026&month=6
   *
   * 统计口径（二次开发文档 3.3 / 5.4）：
   * - 台账一律剔除 status='terminated'
   * - 台账→房产归属一律 contract_id → contracts.property_id
   * - 已出租面积 = 台账"期末租户集合"（按 tenant 去重）∩ 该房产期末在租合同（approved 且日期覆盖所选月份）的 lease_area 累加
   * - 金额用 COALESCE(amendment_*, monthly_*)
   */
  async getPropertyRentSummary(
    year: number,
    month: number,
  ): Promise<PropertyRentSummaryResp> {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month 参数不合法');
    }
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    // 1) 房产列表（含可出租面积，按名称升序）
    const props = await this.db.select().from(properties).orderBy(asc(properties.name));

    // 2) 全部合同（用于面积匹配与房产归属）
    const contractRows = await this.db.select().from(contracts);
    const contractById = new Map(contractRows.map((c) => [c.id, c]));

    // 3) 台账：当年 1 月 ~ 所选月份，剔除已终止（全局统计约定）
    const ledgerRows = await this.db
      .select()
      .from(ledgerItems)
      .where(
        and(
          gte(ledgerItems.period, `${year}-01`),
          lte(ledgerItems.period, monthStr),
          ne(ledgerItems.status, 'terminated'),
        ),
      );

    const items: PropertyRentSummaryItem[] = props.map((prop) =>
      this.computePropertySummary(prop, contractRows, contractById, ledgerRows, year, month),
    );
    return { items, year, month };
  }

  /** 单房产单月"已出租面积"（期末口径，文档 3.3-②） */
  private calcRentedArea(
    prop: { id: string },
    contractRows: typeof contracts.$inferSelect[],
    contractById: Map<string, typeof contracts.$inferSelect>,
    ledgerRows: typeof ledgerItems.$inferSelect[],
    year: number,
    m: number,
  ): number {
    const mStr = `${year}-${String(m).padStart(2, '0')}`;
    const mStart = `${mStr}-01`;
    const mEnd = `${mStr}-${String(daysInMonth(year, m)).padStart(2, '0')}`;

    // 期末租户集合：该月该房产有台账（未终止）的租户，按 tenant 去重
    const tenantSet = new Set<string>();
    for (const row of ledgerRows) {
      if (row.period !== mStr) continue;
      const c = contractById.get(row.contractId);
      if (c && c.propertyId === prop.id) tenantSet.add(c.tenant);
    }

    // 该房产期末在租合同（approved 且日期覆盖所选月份）且租户在集合内 → 累加 lease_area
    let area = 0;
    for (const c of contractRows) {
      if (
        c.propertyId === prop.id &&
        (c.status === 'approved' || c.status === 'terminated') &&
        c.startDate <= mEnd &&
        c.endDate >= mStart &&
        tenantSet.has(c.tenant)
      ) {
        area += c.leaseArea ?? 0;
      }
    }
    return round2(area);
  }

  /** 单房产汇总（文档 3.3 全部指标） */
  private computePropertySummary(
    prop: typeof properties.$inferSelect,
    contractRows: typeof contracts.$inferSelect[],
    contractById: Map<string, typeof contracts.$inferSelect>,
    ledgerRows: typeof ledgerItems.$inferSelect[],
    year: number,
    month: number,
  ): PropertyRentSummaryItem {
    const rentableArea = prop.rentableArea ?? null;

    // 期末已出租面积
    const rentedArea = this.calcRentedArea(
      prop, contractRows, contractById, ledgerRows, year, month,
    );

    // 年累计出租面积（1 月 ~ 所选月份逐月求和）
    let yearRentedArea = 0;
    for (let m = 1; m <= month; m++) {
      yearRentedArea += this.calcRentedArea(
        prop, contractRows, contractById, ledgerRows, year, m,
      );
    }

    // 年累计租金 / 物业费（COALESCE 变更后金额优先，台账已剔除 terminated）
    let yearRent = 0;
    let yearPropertyFee = 0;
    for (const row of ledgerRows) {
      const c = contractById.get(row.contractId);
      if (c && c.propertyId === prop.id) {
        yearRent += row.amendmentRent ?? row.monthlyRent ?? 0;
        yearPropertyFee += row.amendmentPropertyFee ?? row.monthlyPropertyFee ?? 0;
      }
    }

    const validBase = rentableArea != null && rentableArea > 0;
    return {
      propertyId: prop.id,
      propertyName: prop.name,
      rentableArea: rentableArea != null ? round2(rentableArea) : null,
      rentedArea,
      vacantArea: rentableArea != null ? round2(Math.max(0, rentableArea - rentedArea)) : null,
      avgRentRate: validBase ? round4(yearRentedArea / month / rentableArea) : null,
      endRentRate: validBase ? round4(rentedArea / rentableArea) : null,
      yearRent: round2(yearRent),
      yearPropertyFee: round2(yearPropertyFee),
    };
  }
}
