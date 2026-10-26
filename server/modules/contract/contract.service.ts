import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { UtilityService } from '../utility/utility.service';
import {
  contracts,
  contractStages,
  contractAmendments,
  contractAmendmentStages,
  ledgerItems,
  properties,
} from '@server/database/schema';
import {
  eq,
  and,
  count,
  desc,
  asc,
  ilike,
  inArray,
} from 'drizzle-orm';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import type {
  CreateContractDto,
  UpdateContractDto,
  ContractStage,
  CreateContractAmendmentDto,
  ContractAmendmentResponse,
} from '@shared/api.interface';

// 事务内查询/写入使用的数据库句柄（与 permission.controller.ts 的 db.transaction 模式一致）
type Tx = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly utilityService: UtilityService,
  ) {}

  // ==================== CRUD ====================

  /** 实时查询房产 ID 对应的房产名称（contracts 表不冗余存储，统一实时查 properties） */
  private async getPropertyName(propertyId?: string | null): Promise<string | undefined> {
    if (!propertyId) return undefined;
    const propRows = await this.db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    return propRows[0]?.name;
  }

  async createContract(
    dto: CreateContractDto,
    creator: string
  ): Promise<{ id: string }> {
    try {
      this.logger.log(`创建合同: ${dto.contractNo}, 创建人: ${creator}`);

      // 合同主表与分段同事务写入：任一步失败整体回滚，不留半状态
      const contractId = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(contracts)
          .values({
            contractNo: dto.contractNo,
            contractType: dto.contractType ?? 'new_contract',
            parentContractId: dto.parentContractId ? dto.parentContractId : null,
            propertyId: dto.propertyId || null,
            landlord: dto.landlord,
            tenant: dto.tenant,
            startDate: dto.startDate,
            endDate: dto.endDate,
            hasUtilities: dto.hasUtilities,
            paymentMethod: dto.paymentMethod,
            advancePaymentDays: dto.advancePaymentDays,
            status: 'draft',
            signDate: dto.signDate ?? null,
            leaseAddress: dto.leaseAddress ?? null,
            leaseArea: dto.leaseArea ?? null,
            creator,
          })
          .returning({ id: contracts.id });

        const newId = inserted[0]?.id;
        if (!newId) {
          throw new BusinessException(
            ResponseCode.INTERNAL_ERROR,
            '合同创建失败'
          );
        }

        await this.insertStages(newId, dto.stages, tx);
        return newId;
      });

      this.logger.log(`合同创建成功, id: ${contractId}`);
      return { id: contractId };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        `创建合同失败: ${JSON.stringify(dto)}`,
        error as Error
      );
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `创建合同失败: ${(error as Error).message}`
      );
    }
  }

  async findAll(params: {
    status?: string;
    tenant?: string;
    page?: number;
    pageSize?: number;
  }) {
    try {
      const { status, tenant, page = 1, pageSize } = params;

      const conditions = [];
      if (status) {
        conditions.push(eq(contracts.status, status));
      }
      if (tenant) {
        conditions.push(ilike(contracts.tenant, `%${tenant}%`));
      }

      const baseQuery = this.db.select().from(contracts);
      const countQuery = this.db
        .select({ count: count() })
        .from(contracts);

      if (conditions.length > 0) {
        baseQuery.where(and(...conditions));
        countQuery.where(and(...conditions));
      }

      baseQuery.orderBy(desc(contracts.createdAt));

      if (pageSize) {
        baseQuery.limit(pageSize).offset((page - 1) * pageSize);
      }

      const [items, totalResult] = await Promise.all([
        baseQuery,
        countQuery,
      ]);

      const total = totalResult[0]?.count ?? 0;

      const contractIds = items.map((c) => c.id);
      let stagesMap: Record<string, ContractStage[]> = {};
      let propertyMap: Record<string, { name: string }> = {};
      let amendmentsMap: Record<string, ContractAmendmentResponse[]> = {};
      if (contractIds.length > 0) {
        const allStages = await this.db
          .select()
          .from(contractStages)
          .where(inArray(contractStages.contractId, contractIds))
          .orderBy(asc(contractStages.stageOrder));

        stagesMap = allStages.reduce(
          (acc, s) => {
            if (!acc[s.contractId]) acc[s.contractId] = [];
            acc[s.contractId].push({
              id: s.id,
              startDate: s.startDate,
              endDate: s.endDate,
              monthlyRent: s.monthlyRent,
              monthlyPropertyFee: s.monthlyPropertyFee,
              stageOrder: s.stageOrder,
              stageType: s.stageType ?? undefined,
            });
            return acc;
          },
          {} as Record<string, ContractStage[]>,
        );

        const propertyIds = [
          ...new Set(
            items
              .map((c) => c.propertyId)
              .filter((id): id is string => !!id),
          ),
        ];
        if (propertyIds.length > 0) {
          const propertyRows = await this.db
            .select({ id: properties.id, name: properties.name })
            .from(properties)
            .where(inArray(properties.id, propertyIds));
          propertyMap = propertyRows.reduce(
            (acc, p) => {
              acc[p.id] = { name: p.name };
              return acc;
            },
            {} as Record<string, { name: string }>,
          );
        }

        const allAmendments = await this.db
          .select()
          .from(contractAmendments)
          .where(inArray(contractAmendments.contractId, contractIds))
          .orderBy(desc(contractAmendments.createdAt));

        if (allAmendments.length > 0) {
          const amendmentIds = allAmendments.map((a) => a.id);
          const allAmendStages = await this.db
            .select()
            .from(contractAmendmentStages)
            .where(inArray(contractAmendmentStages.amendmentId, amendmentIds))
            .orderBy(asc(contractAmendmentStages.stageOrder));

          const amendStagesMap = allAmendStages.reduce(
            (acc, s) => {
              if (!acc[s.amendmentId]) acc[s.amendmentId] = [];
              acc[s.amendmentId].push({
                id: s.id,
                startDate: s.startDate,
                endDate: s.endDate,
                monthlyRent: s.monthlyRent,
                monthlyPropertyFee: s.monthlyPropertyFee,
                stageOrder: s.stageOrder,
                stageType: s.stageType ?? undefined,
              });
              return acc;
            },
            {} as Record<string, Array<{ id: string; startDate: string; endDate: string; monthlyRent: number; monthlyPropertyFee: number; stageOrder: number; stageType?: string | null }>>,
          );

          amendmentsMap = allAmendments.reduce(
            (acc, a) => {
              if (!acc[a.contractId]) acc[a.contractId] = [];
              acc[a.contractId].push({
                id: a.id,
                contractId: a.contractId,
                amendmentNo: a.amendmentNo,
                changeStartDate: a.changeStartDate,
                changeEndDate: a.changeEndDate,
                changeType: a.changeType,
                signDate: a.signDate ?? undefined,
                status: a.status as 'pending' | 'approved' | 'rejected',
                stages: amendStagesMap[a.id] ?? [],
                reviewRemark: a.reviewRemark ?? undefined,
                reviewer: a.reviewer ?? undefined,
                _createdAt: a.createdAt?.toISOString(),
              });
              return acc;
            },
            {} as Record<string, ContractAmendmentResponse[]>,
          );
        }
      }

      const result = items.map((c) => ({
        id: c.id,
        contractNo: c.contractNo,
        contractType: (c.contractType as 'new_contract' | 'supplement') ?? 'new_contract',
        parentContractId: c.parentContractId ?? undefined,
        propertyId: c.propertyId ?? undefined,
        propertyName: c.propertyId
          ? propertyMap[c.propertyId]?.name ?? undefined
          : undefined,
        landlord: c.landlord,
        tenant: c.tenant,
        startDate: c.startDate,
        endDate: c.endDate,
        hasUtilities: c.hasUtilities,
        paymentMethod: c.paymentMethod as 'monthly' | 'quarterly',
        advancePaymentDays: c.advancePaymentDays,
        status: c.status as
          | 'draft'
          | 'pending'
          | 'approved'
          | 'rejected'
          | 'terminated',
        terminationDate: c.terminationDate ?? undefined,
        signDate: c.signDate ?? undefined,
        leaseAddress: c.leaseAddress ?? undefined,
        leaseArea: c.leaseArea ?? undefined,
        reviewRemark: c.reviewRemark ?? undefined,
        reviewer: c.reviewer ?? undefined,
        creator: c.creator ?? undefined,
        stages: stagesMap[c.id] ?? [],
        amendments: amendmentsMap[c.id] ?? [],
        _createdAt: c.createdAt?.toISOString(),
        _updatedAt: c.updatedAt?.toISOString(),
      }));

      return {
        items: result,
        total,
        page: pageSize ? page : 1,
        pageSize: pageSize ?? result.length,
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error('查询合同列表失败', error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询合同列表失败: ${(error as Error).message}`
      );
    }
  }

  async findOne(id: string) {
    try {
      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在'
        );
      }

      const c = contractRows[0];

      let propertyName: string | undefined;
      if (c.propertyId) {
        const propRows = await this.db
          .select({ name: properties.name })
          .from(properties)
          .where(eq(properties.id, c.propertyId))
          .limit(1);
        propertyName = propRows[0]?.name;
      }

      const stages = await this.db
        .select()
        .from(contractStages)
        .where(eq(contractStages.contractId, id))
        .orderBy(asc(contractStages.stageOrder));

      return {
        id: c.id,
        contractNo: c.contractNo,
        contractType: (c.contractType as 'new_contract' | 'supplement') ?? 'new_contract',
        parentContractId: c.parentContractId ?? undefined,
        propertyId: c.propertyId ?? undefined,
        propertyName,
        landlord: c.landlord,
        tenant: c.tenant,
        startDate: c.startDate,
        endDate: c.endDate,
        hasUtilities: c.hasUtilities,
        paymentMethod: c.paymentMethod as 'monthly' | 'quarterly',
        advancePaymentDays: c.advancePaymentDays,
        status: c.status as
          | 'draft'
          | 'pending'
          | 'approved'
          | 'rejected'
          | 'terminated',
        terminationDate: c.terminationDate ?? undefined,
        signDate: c.signDate ?? undefined,
        leaseAddress: c.leaseAddress ?? undefined,
        leaseArea: c.leaseArea ?? undefined,
        reviewRemark: c.reviewRemark ?? undefined,
        reviewer: c.reviewer ?? undefined,
        creator: c.creator ?? undefined,
        stages: stages.map((s) => ({
          id: s.id,
          startDate: s.startDate,
          endDate: s.endDate,
          monthlyRent: s.monthlyRent,
          monthlyPropertyFee: s.monthlyPropertyFee,
          stageOrder: s.stageOrder,
          stageType: s.stageType ?? undefined,
        })),
        _createdAt: c.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`查询合同详情失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `查询合同详情失败: ${(error as Error).message}`
      );
    }
  }

  async update(id: string, dto: UpdateContractDto) {
    try {
      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在'
        );
      }

      const current = contractRows[0];
      if (current.status !== 'draft' && current.status !== 'rejected') {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          '仅草稿或被驳回状态的合同可以编辑'
        );
      }

      const updateFields: Record<string, unknown> = {};
      if (dto.contractNo !== undefined)
        updateFields.contractNo = dto.contractNo;
      if (dto.propertyId !== undefined)
        updateFields.propertyId = dto.propertyId || null;
      if (dto.landlord !== undefined) updateFields.landlord = dto.landlord;
      if (dto.tenant !== undefined) updateFields.tenant = dto.tenant;
      if (dto.startDate !== undefined) updateFields.startDate = dto.startDate;
      if (dto.endDate !== undefined) updateFields.endDate = dto.endDate;
      if (dto.hasUtilities !== undefined)
        updateFields.hasUtilities = dto.hasUtilities;
      if (dto.paymentMethod !== undefined)
        updateFields.paymentMethod = dto.paymentMethod;
      if (dto.advancePaymentDays !== undefined)
        updateFields.advancePaymentDays = dto.advancePaymentDays;
      if (dto.signDate !== undefined) updateFields.signDate = dto.signDate;
      if (dto.leaseAddress !== undefined)
        updateFields.leaseAddress = dto.leaseAddress;
      if (dto.contractType !== undefined)
        updateFields.contractType = dto.contractType;
      if (dto.parentContractId !== undefined)
        updateFields.parentContractId = dto.parentContractId ? dto.parentContractId : null;
      if (dto.leaseArea !== undefined)
        updateFields.leaseArea = dto.leaseArea;
      if (dto.status !== undefined && (dto.status === 'draft' || dto.status === 'rejected'))
        updateFields.status = dto.status;

      if (dto.stages && dto.stages.length > 0) {
        // 主表更新与分段全删全插同事务：中途失败不回半新分段
        await this.db.transaction(async (tx) => {
          if (Object.keys(updateFields).length > 0) {
            await tx.update(contracts).set(updateFields).where(eq(contracts.id, id));
          }
          await tx.delete(contractStages).where(eq(contractStages.contractId, id));
          await this.insertStages(id, dto.stages, tx);
        });
      } else if (Object.keys(updateFields).length > 0) {
        await this.db
          .update(contracts)
          .set(updateFields)
          .where(eq(contracts.id, id));
      }

      // 编辑合同打开“收取水电费”时，同步把租户写入 utility_tenants（按租户+房产幂等去重）
      if (dto.hasUtilities) {
        const finalTenant = dto.tenant !== undefined ? dto.tenant : current.tenant;
        const finalPropertyId =
          dto.propertyId !== undefined ? dto.propertyId : current.propertyId;
        const finalPropertyName = await this.getPropertyName(finalPropertyId);
        await this.utilityService.ensureTenant(finalTenant, finalPropertyName);
        // 编辑时切换了房产：旧房产若无其他生效合同则停用对应 utility_tenants 行
        if (dto.propertyId && current.propertyId && dto.propertyId !== current.propertyId) {
          const oldPropertyName = await this.getPropertyName(current.propertyId);
          if (oldPropertyName) {
            await this.utilityService.deactivateTenantIfNoActiveContract(finalTenant, oldPropertyName);
          }
        }
      }

      this.logger.log(`合同更新成功, id: ${id}`);
      return { id };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`更新合同失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `更新合同失败: ${(error as Error).message}`
      );
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在'
        );
      }

      const current = contractRows[0];
      if (current.status === 'approved') {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          '已审核通过的合同不可删除'
        );
      }

      await this.db.delete(contracts).where(eq(contracts.id, id));
      this.logger.log(`合同删除成功, id: ${id}`);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`删除合同失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `删除合同失败: ${(error as Error).message}`
      );
    }
  }

  // ==================== 审核流程 ====================

  async submitForReview(id: string): Promise<void> {
    try {
      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在'
        );
      }

      const current = contractRows[0];
      if (current.status !== 'draft' && current.status !== 'rejected') {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          '仅草稿或被驳回状态的合同可以提交审核'
        );
      }

      await this.db
        .update(contracts)
        .set({ status: 'pending' })
        .where(eq(contracts.id, id));

      this.logger.log(`合同已提交审核, id: ${id}`);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        `提交审核失败, id: ${id}`,
        error as Error
      );
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `提交审核失败: ${(error as Error).message}`
      );
    }
  }

  async review(
    id: string,
    action: 'approve' | 'reject',
    remark: string,
    reviewer: string
  ): Promise<void> {
    try {
      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在'
        );
      }

      const current = contractRows[0];
      if (current.status !== 'pending') {
        throw new BusinessException(
          ResponseCode.BAD_REQUEST,
          '仅待审核状态的合同可以审核'
        );
      }

      if (action === 'approve') {
        // 事务保护：「更新合同状态为 approved」与「台账批量插入」必须原子生效。
        // 失败回退行为：任一步骤抛错，事务整体回滚——合同保持 pending 状态、
        // 台账不写入任何行；错误向上传播，由下方 catch 记录并以 BusinessException 返回调用方。
        await this.db.transaction(async (tx) => {
          await tx
            .update(contracts)
            .set({
              status: 'approved',
              reviewRemark: remark,
              reviewer,
            })
            .where(eq(contracts.id, id));

          this.logger.log(`合同审核通过, id: ${id}`);
          await this.generateLedger(id, tx);
        });

        if (current.hasUtilities) {
          const propertyName = await this.getPropertyName(current.propertyId);
          await this.utilityService.ensureTenant(current.tenant, propertyName);
        }
      } else {
        await this.db
          .update(contracts)
          .set({
            status: 'rejected',
            reviewRemark: remark,
            reviewer,
          })
          .where(eq(contracts.id, id));

        this.logger.log(`合同审核驳回, id: ${id}`);
      }
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`审核合同失败, id: ${id}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `审核合同失败: ${(error as Error).message}`
      );
    }
  }

  // ==================== 台账自动生成 ====================

  async regenerateLedger(contractId: string): Promise<{ success: boolean; message: string; count: number }> {
    // 事务保护：「删除旧台账」与「重新生成台账」原子执行。
    // 失败回退行为：生成失败时事务回滚，旧台账保留不被清空。
    await this.db.transaction(async (tx) => {
      await tx.delete(ledgerItems).where(eq(ledgerItems.contractId, contractId));
      await this.generateLedger(contractId, tx);
    });
    const result = await this.db.select({ count: count() }).from(ledgerItems).where(eq(ledgerItems.contractId, contractId));
    return { success: true, message: '台账重新生成完成', count: result[0]?.count ?? 0 };
  }

  private async generateLedger(contractId: string, tx?: Tx): Promise<void> {
    try {
      // tx 存在时走调用方事务（与状态更新共享同一事务），否则独立执行
      const db = tx ?? this.db;
      const contractRows = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);

      if (contractRows.length === 0) {
        this.logger.error(
          `生成台账失败: 合同不存在, id: ${contractId}`
        );
        return;
      }

      const contract = contractRows[0];

      let propertyName: string | null = null;
      if (contract.propertyId) {
        const propRows = await db
          .select({ name: properties.name })
          .from(properties)
          .where(eq(properties.id, contract.propertyId))
          .limit(1);
        propertyName = propRows[0]?.name ?? null;
      }

      const stages = await db
        .select()
        .from(contractStages)
        .where(eq(contractStages.contractId, contractId))
        .orderBy(asc(contractStages.stageOrder));

      if (stages.length === 0) {
        this.logger.warn(
          `合同无阶段数据, 跳过台账生成, id: ${contractId}`
        );
        return;
      }

      type LedgerInsert = typeof ledgerItems.$inferInsert;
      const ledgerValues: LedgerInsert[] = [];
      const isQuarterly = contract.paymentMethod === 'quarterly';

      for (const stage of stages) {
        const stageStart = this.parseDateLocal(stage.startDate);
        const stageEnd = this.parseDateLocal(stage.endDate);
        const monthlyRent = stage.monthlyRent;
        const monthlyPropertyFee = stage.monthlyPropertyFee;

        const months = this.getMonthsInRange(stageStart, stageEnd);

        for (const m of months) {
          const { rent, propertyFee } =
            this.calcMonthlyAmount(
              m,
              stageStart,
              stageEnd,
              monthlyRent,
              monthlyPropertyFee,
              contract.paymentMethod as 'monthly' | 'quarterly'
            );

          let quarter: string | undefined;
          if (isQuarterly) {
            const month = m.stageStart.getMonth();
            quarter = `${m.stageStart.getFullYear()}-Q${Math.floor(month / 3) + 1}`;
          }

          ledgerValues.push({
            contractId: contract.id,
            contractNo: contract.contractNo,
            propertyName: propertyName ?? null,
            landlord: contract.landlord,
            tenant: contract.tenant,
            period: m.period,
            stageStartDate: this.formatDateLocal(m.stageStart),
            stageEndDate: this.formatDateLocal(m.stageEnd),
            monthlyRent: rent,
            monthlyPropertyFee: propertyFee,
            paymentMethod: contract.paymentMethod,
            dueDate: '',
            rentReceived: 0,
            propertyFeeReceived: 0,
            status:
              Number(rent) === 0 && Number(propertyFee) === 0
                ? 'no_payment_required'
                : 'unpaid',
            hasUtilities: contract.hasUtilities,
            quarter,
          });
        }
      }

      // 第二阶段：按月付/季付计算最后缴纳期限
      const advanceDays = contract.advancePaymentDays;
      if (isQuarterly) {
        // 季付：按合同+季度分组，取最小阶段起始日-提前天数，同季度所有行共享
        const quarterMinStart = new Map<string, Date>();
        for (const item of ledgerValues) {
          if (!item.quarter) continue;
          const key = `${item.contractId}-${item.quarter}`;
          const itemDate = this.parseDateLocal(item.stageStartDate);
          const existing = quarterMinStart.get(key);
          if (!existing || itemDate < existing) {
            quarterMinStart.set(key, itemDate);
          }
        }
        for (const item of ledgerValues) {
          if (!item.quarter) continue;
          const key = `${item.contractId}-${item.quarter}`;
          const minStart = quarterMinStart.get(key)!;
          item.dueDate = this.calcDueDate(minStart, advanceDays);
        }
      } else {
        // 月付：每行独立计算 = 阶段起始日-提前天数
        for (const item of ledgerValues) {
          item.dueDate = this.calcDueDate(
            this.parseDateLocal(item.stageStartDate),
            advanceDays
          );
        }
      }

      if (ledgerValues.length > 0) {
        await db.insert(ledgerItems).values(ledgerValues);
        this.logger.log(
          `台账生成完成, 合同: ${contract.contractNo}, ` +
            `明细条数: ${ledgerValues.length}`
        );
      }
    } catch (error) {
      this.logger.error(
        `生成台账失败, 合同id: ${contractId}`,
        error as Error
      );
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `生成台账失败: ${(error as Error).message}`
      );
    }
  }

  // ==================== 合同变更 ====================

  async getAmendmentPeriods(
    contractId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ period: string; stageStartDate: string; stageEndDate: string; originalRent: number; originalPropertyFee: number }>> {
    const contractRows = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);

    if (contractRows.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '合同不存在');
    }

    const items = await this.db
      .select()
      .from(ledgerItems)
      .where(eq(ledgerItems.contractId, contractId));

    const changeStart = this.parseDateLocal(startDate);
    const changeEnd = this.parseDateLocal(endDate);

    const matched = items.filter((item: typeof ledgerItems.$inferSelect) => {
      const rowStart = this.parseDateLocal(item.stageStartDate);
      const rowEnd = this.parseDateLocal(item.stageEndDate);
      return rowStart <= changeEnd && rowEnd >= changeStart;
    });

    matched.sort((a: typeof ledgerItems.$inferSelect, b: typeof ledgerItems.$inferSelect) => {
      if (a.period !== b.period) return a.period.localeCompare(b.period);
      return a.stageStartDate.localeCompare(b.stageStartDate);
    });

    return matched.map((item: typeof ledgerItems.$inferSelect) => ({
      period: item.period,
      stageStartDate: item.stageStartDate,
      stageEndDate: item.stageEndDate,
      originalRent: item.monthlyRent,
      originalPropertyFee: item.monthlyPropertyFee,
    }));
  }

  async createAmendment(
    dto: CreateContractAmendmentDto,
    creator: string,
  ): Promise<{ id: string }> {
    try {
      this.logger.log(`创建合同变更: ${dto.amendmentNo || dto.changeType}, 合同ID: ${dto.contractId}`);

      const contractRows = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, dto.contractId))
        .limit(1);

      if (contractRows.length === 0) {
        throw new BusinessException(ResponseCode.NOT_FOUND, '合同不存在');
      }

      const contract = contractRows[0];
      if (contract.status !== 'approved') {
        throw new BusinessException(ResponseCode.BAD_REQUEST, '仅已审核通过的合同可以变更');
      }

      const isUtilityChange = dto.changeType === 'utility_enable' || dto.changeType === 'utility_disable';
      const changeStart = this.parseDateLocal(dto.changeStartDate);
      const contractEnd = this.parseDateLocal(contract.endDate);
      if (changeStart <= contractEnd && !isUtilityChange) {
        // 变更开始日期校验：需大于最近一次收款日期
        const lastReceived = await this.db
          .select({ receiveDate: ledgerItems.receiveDate, period: ledgerItems.period })
          .from(ledgerItems)
          .where(
            and(
              eq(ledgerItems.contractId, dto.contractId),
              eq(ledgerItems.status, 'paid'),
            ),
          )
          .orderBy(desc(ledgerItems.period));

        if (lastReceived.length > 0) {
          const lastPaidPeriod = lastReceived[0].period;
          const [year, month] = lastPaidPeriod.split('-').map(Number);
          const lastPaidEnd = new Date(year, month, 0);
          const lastPaidEndStr = this.formatDateLocal(lastPaidEnd);

          if (changeStart <= this.parseDateLocal(lastPaidEndStr)) {
            throw new BusinessException(
              ResponseCode.BAD_REQUEST,
              `变更开始日期必须大于最近一次收款所属期（${lastPaidPeriod}），如需填写该日期前的日期请联系财务`,
            );
          }
        }
      }

      // 变更单与分段同事务写入：任一步失败整体回滚，不留半状态
      const amendmentId = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(contractAmendments)
          .values({
            contractId: dto.contractId,
            amendmentNo: isUtilityChange ? null : (dto.amendmentNo || null),
            changeStartDate: dto.changeStartDate,
            changeEndDate: dto.changeEndDate,
            changeType: dto.changeType,
            signDate: dto.signDate ?? null,
            status: 'pending',
          })
          .returning({ id: contractAmendments.id });

        const newId = inserted[0]?.id;
        if (!newId) {
          throw new BusinessException(ResponseCode.INTERNAL_ERROR, '变更记录创建失败');
        }

        if (dto.stages.length > 0) {
          await tx.insert(contractAmendmentStages).values(
            dto.stages.map((s, idx) => {
              return {
                amendmentId: newId,
                startDate: s.stageStartDate,
                endDate: s.stageEndDate,
                monthlyRent: s.monthlyRent,
                monthlyPropertyFee: s.monthlyPropertyFee,
                stageOrder: idx,
                period: s.period,
              };
            }),
          );
        }
        return newId;
      });

      this.logger.log(`合同变更创建成功, id: ${amendmentId}`);
      return { id: amendmentId };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`创建合同变更失败: ${JSON.stringify(dto)}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `创建合同变更失败: ${(error as Error).message}`,
      );
    }
  }

  async reviewAmendment(
    amendmentId: string,
    action: 'approve' | 'reject',
    remark: string,
    reviewer: string,
  ): Promise<{ success: boolean }> {
    try {
      const amendmentRows = await this.db
        .select()
        .from(contractAmendments)
        .where(eq(contractAmendments.id, amendmentId))
        .limit(1);

      if (amendmentRows.length === 0) {
        throw new BusinessException(ResponseCode.NOT_FOUND, '变更记录不存在');
      }

      const amendment = amendmentRows[0];

      if (amendment.status !== 'pending') {
        throw new BusinessException(ResponseCode.BAD_REQUEST, '该变更记录不在待审核状态');
      }

      if (action === 'approve') {
        const isUtilityChange = amendment.changeType === 'utility_enable' || amendment.changeType === 'utility_disable';

        let stages: Array<{ period: string | null; startDate: string | null; endDate: string | null; monthlyRent: number; monthlyPropertyFee: number }> = [];
        if (!isUtilityChange) {
          stages = (await this.db
            .select()
            .from(contractAmendmentStages)
            .where(eq(contractAmendmentStages.amendmentId, amendmentId))
            .orderBy(asc(contractAmendmentStages.stageOrder))).map((s) => ({
              period: s.period,
              startDate: s.startDate,
              endDate: s.endDate,
              monthlyRent: s.monthlyRent,
              monthlyPropertyFee: s.monthlyPropertyFee,
            }));
        }

        await this.db.transaction(async (tx) => {
          await tx
            .update(contractAmendments)
            .set({ status: 'approved', reviewRemark: remark || null, reviewer })
            .where(eq(contractAmendments.id, amendmentId));

          if (isUtilityChange) {
            await this.applyUtilityChangeToLedger(
              amendment.contractId,
              amendment.changeStartDate,
              amendment.changeEndDate,
              amendment.changeType === 'utility_enable',
              tx,
            );
          } else {
            await this.applyAmendmentToLedger(
              amendment.contractId,
              amendment.amendmentNo,
              stages,
              tx,
            );
          }
        });

        this.logger.log(`变更审核通过, id: ${amendmentId}`);
      } else {
        await this.db
          .update(contractAmendments)
          .set({ status: 'rejected', reviewRemark: remark || null, reviewer })
          .where(eq(contractAmendments.id, amendmentId));

        this.logger.log(`变更审核驳回, id: ${amendmentId}`);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(`审核变更失败, id: ${amendmentId}`, error as Error);
      throw new BusinessException(
        ResponseCode.INTERNAL_ERROR,
        `审核变更失败: ${(error as Error).message}`,
      );
    }
  }

  private async applyAmendmentToLedger(
    contractId: string,
    amendmentNo: string,
    stages: Array<{ period: string | null; startDate: string | null; endDate: string | null; monthlyRent: number; monthlyPropertyFee: number }>,
    tx?: Tx,
  ): Promise<void> {
    const db = tx ?? this.db;
    const stageMap = new Map<string, { monthlyRent: number; monthlyPropertyFee: number }>();
    for (const s of stages) {
      if (s.period && s.startDate) {
        const compositeKey = `${s.period}|${s.startDate}`;
        stageMap.set(compositeKey, { monthlyRent: s.monthlyRent, monthlyPropertyFee: s.monthlyPropertyFee });
      }
    }

    const targetItems = await db
      .select()
      .from(ledgerItems)
      .where(eq(ledgerItems.contractId, contractId));

    for (const item of targetItems) {
      if (item.receiveDate) continue;

      const compositeKey = `${item.period}|${item.stageStartDate}`;
      const stageData = stageMap.get(compositeKey);
      if (!stageData) continue;

      // 变更后应收双 0（免租）→ 无需收款；否则按已收金额回落收款进度状态。已终止行不覆盖
      let newStatus: string | undefined;
      if (item.status !== 'terminated') {
        const receivableRent = Number(stageData.monthlyRent);
        const receivablePropertyFee = Number(stageData.monthlyPropertyFee);
        if (receivableRent === 0 && receivablePropertyFee === 0) {
          newStatus = 'no_payment_required';
        } else if (Number(item.rentReceived) > 0 || Number(item.propertyFeeReceived) > 0) {
          newStatus = 'partial';
        } else {
          newStatus = 'unpaid';
        }
      }

      await db
        .update(ledgerItems)
        .set({
          amendmentNo,
          amendmentRent: stageData.monthlyRent,
          amendmentPropertyFee: stageData.monthlyPropertyFee,
          ...(newStatus ? { status: newStatus } : {}),
        })
        .where(eq(ledgerItems.id, item.id));
    }
  }

  private async applyUtilityChangeToLedger(
    contractId: string,
    changeStartDate: string,
    changeEndDate: string,
    enableUtilities: boolean,
    tx?: Tx,
  ): Promise<void> {
    const db = tx ?? this.db;
    if (enableUtilities) {
      await db
        .update(contracts)
        .set({ hasUtilities: true })
        .where(eq(contracts.id, contractId));

      // 变更开启水电费时，同步把租户写入 utility_tenants（按租户+房产幂等去重）
      const contractRows = await db
        .select({ tenant: contracts.tenant, propertyId: contracts.propertyId })
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      if (contractRows.length > 0) {
        const propertyName = await this.getPropertyName(contractRows[0].propertyId);
        await this.utilityService.ensureTenant(contractRows[0].tenant, propertyName);
      }
    }

    const targetItems = await db
      .select({ id: ledgerItems.id, period: ledgerItems.period })
      .from(ledgerItems)
      .where(eq(ledgerItems.contractId, contractId));

    const changeStartPeriod = changeStartDate.substring(0, 7);
    const changeEndPeriod = changeEndDate.substring(0, 7);

    for (const item of targetItems) {
      if (item.period >= changeStartPeriod && item.period <= changeEndPeriod) {
        await db
          .update(ledgerItems)
          .set({ hasUtilities: enableUtilities })
          .where(eq(ledgerItems.id, item.id));
      }
    }
  }

  async findAmendments(contractId: string) {
    const amendments = await this.db
      .select()
      .from(contractAmendments)
      .where(eq(contractAmendments.contractId, contractId))
      .orderBy(desc(contractAmendments.createdAt));

    if (amendments.length === 0) return [];

    const amendmentIds = amendments.map((a) => a.id);
    const allStages = await this.db
      .select()
      .from(contractAmendmentStages)
      .where(inArray(contractAmendmentStages.amendmentId, amendmentIds))
      .orderBy(asc(contractAmendmentStages.stageOrder));

    const stagesMap = allStages.reduce(
      (acc, s) => {
        if (!acc[s.amendmentId]) acc[s.amendmentId] = [];
        acc[s.amendmentId].push({
          id: s.id,
          startDate: s.startDate,
          endDate: s.endDate,
          monthlyRent: s.monthlyRent,
          monthlyPropertyFee: s.monthlyPropertyFee,
          stageOrder: s.stageOrder,
          stageType: s.stageType ?? undefined,
        });
        return acc;
      },
      {} as Record<string, Array<{ id: string; startDate: string; endDate: string; monthlyRent: number; monthlyPropertyFee: number; stageOrder: number; stageType?: string | null }>>,
    );

    return amendments.map((a) => ({
      id: a.id,
      contractId: a.contractId,
      amendmentNo: a.amendmentNo,
      changeStartDate: a.changeStartDate,
      changeEndDate: a.changeEndDate,
      changeType: a.changeType,
      signDate: a.signDate ?? undefined,
      status: a.status as 'pending' | 'approved' | 'rejected',
      stages: stagesMap[a.id] ?? [],
      reviewRemark: a.reviewRemark ?? undefined,
      reviewer: a.reviewer ?? undefined,
      _createdAt: a.createdAt?.toISOString(),
    }))
  }

  async getLastPaidPeriod(contractId: string): Promise<string | null> {
    const result = await this.db
      .select({ period: ledgerItems.period })
      .from(ledgerItems)
      .where(
        and(
          eq(ledgerItems.contractId, contractId),
          eq(ledgerItems.status, 'paid'),
        ),
      )
      .orderBy(desc(ledgerItems.period))
      .limit(1);
    return result[0]?.period ?? null;
  }

  // ==================== 辅助方法 ====================

  private async insertStages(
    contractId: string,
    stages: ContractStage[],
    tx?: Tx
  ): Promise<void> {
    if (stages.length === 0) return;

    const values = stages.map((s, idx) => ({
      contractId,
      startDate: s.startDate,
      endDate: s.endDate,
      monthlyRent: s.monthlyRent,
      monthlyPropertyFee: s.monthlyPropertyFee,
      stageOrder: s.stageOrder ?? idx,
      stageType: s.stageType ?? null,
    }));

    const db = tx ?? this.db;
    await db.insert(contractStages).values(values);
  }

  private getMonthsInRange(
    start: Date,
    end: Date
  ): Array<{
    period: string;
    stageStart: Date;
    stageEnd: Date;
    daysInMonth: number;
    stageDays: number;
  }> {
    const months: Array<{
      period: string;
      stageStart: Date;
      stageEnd: Date;
      daysInMonth: number;
      stageDays: number;
    }> = [];

    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const stageStart = start > firstDay ? start : firstDay;
      const stageEnd = end < lastDay ? end : lastDay;

      if (stageStart > stageEnd) {
        current.setMonth(current.getMonth() + 1);
        continue;
      }

      const daysInMonth = lastDay.getDate();
      const stageDays =
        Math.floor(
          (stageEnd.getTime() - stageStart.getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      months.push({
        period: `${year}-${String(month + 1).padStart(2, '0')}`,
        stageStart,
        stageEnd,
        daysInMonth,
        stageDays,
      });

      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  private calcMonthlyAmount(
    monthInfo: {
      period: string;
      stageStart: Date;
      stageEnd: Date;
      daysInMonth: number;
      stageDays: number;
    },
    stageStart: Date,
    stageEnd: Date,
    monthlyRent: number,
    monthlyPropertyFee: number,
    paymentMethod: 'monthly' | 'quarterly'
  ): { rent: number; propertyFee: number } {
    const { stageStart: ms, stageEnd: me, daysInMonth, stageDays } =
      monthInfo;

    const isFirstMonth =
      ms.getFullYear() === stageStart.getFullYear() &&
      ms.getMonth() === stageStart.getMonth();
    const isLastMonth =
      me.getFullYear() === stageEnd.getFullYear() &&
      me.getMonth() === stageEnd.getMonth();

    let rent = monthlyRent;
    let propertyFee = monthlyPropertyFee;

    if (isFirstMonth || isLastMonth) {
      const ratio = stageDays / daysInMonth;
      rent = Math.round(monthlyRent * ratio * 100) / 100;
      propertyFee =
        Math.round(monthlyPropertyFee * ratio * 100) / 100;
    }

    return { rent, propertyFee };
  }

  private calcDueDate(periodStart: Date, advanceDays: number): string {
    const due = new Date(periodStart);
    due.setDate(due.getDate() - advanceDays);
    return this.formatDateLocal(due);
  }

  private formatDateLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseDateLocal(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
}
