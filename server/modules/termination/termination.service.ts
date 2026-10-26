import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  terminationRequests,
  contracts,
  ledgerItems,
  contractStages,
  properties,
} from '@server/database/schema';
import { UtilityService } from '@server/modules/utility/utility.service';
import { eq, and, desc, gt, lte, gte } from 'drizzle-orm';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import { HttpStatus } from '@nestjs/common';
import type {
  CreateTerminationDto,
  ReviewTerminationDto,
  TerminationRequest,
  TerminationCheckPeriodResponse,
} from '@shared/api.interface';

type Tx = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];

@Injectable()
export class TerminationService {
  private readonly logger = new Logger(TerminationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly utilityService: UtilityService,
  ) {}

  async findAll(params: {
    status?: string;
  }): Promise<TerminationRequest[]> {
    try {
      const conditions = [];
      if (params.status) {
        conditions.push(eq(terminationRequests.status, params.status));
      }

      const query =
        conditions.length > 0
          ? this.db
              .select()
              .from(terminationRequests)
              .where(and(...conditions))
              .orderBy(desc(terminationRequests.createdAt))
          : this.db
              .select()
              .from(terminationRequests)
              .orderBy(desc(terminationRequests.createdAt));

      return query as Promise<TerminationRequest[]>;
    } catch (error) {
      this.logger.error(
        '查询终止申请列表失败',
        JSON.stringify(error),
      );
      throw error;
    }
  }

  async checkPeriod(
    contractId: string,
    terminationDate: string,
  ): Promise<TerminationCheckPeriodResponse> {
    const [contract] = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);

    if (!contract) {
      throw new BusinessException(
        ResponseCode.NOT_FOUND,
        '合同不存在',
        HttpStatus.NOT_FOUND,
      );
    }

    if (terminationDate < contract.startDate || terminationDate > contract.endDate) {
      throw new BusinessException(
        ResponseCode.BUSINESS_ERROR,
        `终止日期必须在合同有效期内（${contract.startDate} 至 ${contract.endDate}）`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const period = terminationDate.substring(0, 7);
    const termDay = parseInt(terminationDate.substring(8, 10), 10);

    const year = parseInt(period.substring(0, 4), 10);
    const month = parseInt(period.substring(5, 7), 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysToCharge = termDay;

    const stages = await this.db
      .select()
      .from(contractStages)
      .where(eq(contractStages.contractId, contractId));

    const isStageEnd = stages.some(s => s.endDate === terminationDate);

    const items = await this.db
      .select()
      .from(ledgerItems)
      .where(
        and(
          eq(ledgerItems.contractId, contractId),
          eq(ledgerItems.period, period),
        ),
      );

    const isPeriodEnd = termDay === daysInMonth;

    const itemsAfterTerm = await this.db
      .select()
      .from(ledgerItems)
      .where(
        and(
          eq(ledgerItems.contractId, contractId),
          gt(ledgerItems.stageStartDate, terminationDate),
        ),
      );

    const hasPaidAfter = itemsAfterTerm.some(
      (item: { status: string }) => item.status === 'paid' || item.status === 'partial',
    );

    if (items.length === 0) {
      return {
        rentPaid: false,
        rentPaidError: hasPaidAfter,
        isPeriodEnd,
        ledgerStatus: '',
        proratedRent: 0,
        proratedPropertyFee: 0,
        period,
        daysInMonth,
        daysToCharge,
        ledgerRecordCount: 0,
        originalRent: 0,
        originalPropertyFee: 0,
        isStageEnd,
        rentReceived: 0,
        propertyFeeReceived: 0,
        amountError: false,
        amountErrorMessage: '',
      };
    }

    let targetItem: (typeof items)[0] | null = null;
    if (items.length === 1) {
      targetItem = items[0];
    } else {
      for (const item of items) {
        const stageStart = parseInt(item.stageStartDate.substring(8, 10), 10);
        const stageEnd = parseInt(item.stageEndDate.substring(8, 10), 10);
        if (termDay >= stageStart && termDay <= stageEnd) {
          targetItem = item;
          break;
        }
      }
      if (!targetItem) {
        targetItem = items[items.length - 1];
      }
    }

    // 应收口径：amendment_* 为 null 才回落原值；变更减免为 0 时应收就是 0
    const expectedRent =
      targetItem.amendmentRent != null ? Number(targetItem.amendmentRent) : Number(targetItem.monthlyRent);
    const expectedFee =
      targetItem.amendmentPropertyFee != null ? Number(targetItem.amendmentPropertyFee) : Number(targetItem.monthlyPropertyFee);
    const fullyPaid = targetItem.status === 'paid' ||
      (targetItem.rentReceived >= expectedRent && targetItem.propertyFeeReceived >= expectedFee);
    const rentPaid = fullyPaid;

    const rentPaidError = hasPaidAfter;

    const originalRent = expectedRent;
    const originalPropertyFee = expectedFee;

    const stageStartDay = parseInt(targetItem.stageStartDate.substring(8, 10), 10);
    const stageEndDay = parseInt(targetItem.stageEndDate.substring(8, 10), 10);
    const stageDays = stageEndDay - stageStartDay + 1;

    const effectiveDays = items.length === 1 ? daysToCharge : (termDay - stageStartDay + 1);

    const proratedRent = Math.round((originalRent / stageDays) * effectiveDays * 100) / 100;
    const proratedPropertyFee = Math.round((originalPropertyFee / stageDays) * effectiveDays * 100) / 100;

    const rentReceived = targetItem.rentReceived;
    const propertyFeeReceived = targetItem.propertyFeeReceived;

    let amountError = false;
    let amountErrorMessage = '';
    if (proratedRent < rentReceived || proratedPropertyFee < propertyFeeReceived) {
      amountError = true;
      amountErrorMessage = `按比例计算的租金/物业费（${proratedRent.toFixed(2)}/${proratedPropertyFee.toFixed(2)}）小于已收金额（${rentReceived.toFixed(2)}/${propertyFeeReceived.toFixed(2)}），请先与财务沟通`;
    }

    return {
      rentPaid,
      rentPaidError,
      isPeriodEnd,
      ledgerStatus: targetItem.status,
      proratedRent,
      proratedPropertyFee,
      period,
      daysInMonth,
      daysToCharge: effectiveDays,
      ledgerRecordCount: items.length,
      targetLedgerId: targetItem.id,
      originalRent,
      originalPropertyFee,
      isStageEnd,
      rentReceived,
      propertyFeeReceived,
      amountError,
      amountErrorMessage,
    };
  }

  async create(
    dto: CreateTerminationDto,
    creator: string,
  ): Promise<TerminationRequest> {
    try {
      const [contract] = await this.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, dto.contractId))
        .limit(1);

      if (!contract) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '合同不存在',
          HttpStatus.NOT_FOUND,
        );
      }

      if (contract.status !== 'approved') {
        throw new BusinessException(
          ResponseCode.BUSINESS_ERROR,
          '仅审核通过的合同可申请终止',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (dto.terminationDate < contract.startDate || dto.terminationDate > contract.endDate) {
        throw new BusinessException(
          ResponseCode.BUSINESS_ERROR,
          `终止日期必须在合同有效期内（${contract.startDate} 至 ${contract.endDate}）`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const checkResult = await this.checkPeriod(dto.contractId, dto.terminationDate);
      if (checkResult.rentPaidError) {
        throw new BusinessException(
          ResponseCode.BUSINESS_ERROR,
          '该合同在终止日期后的期间已部分或全部收款，请先与财务沟通',
          HttpStatus.BAD_REQUEST,
        );
      }

      const [existing] = await this.db
        .select()
        .from(terminationRequests)
        .where(
          and(
            eq(terminationRequests.contractId, dto.contractId),
            eq(terminationRequests.status, 'pending'),
          ),
        )
        .limit(1);

      if (existing) {
        throw new BusinessException(
          ResponseCode.CONFLICT,
          '该合同已有待审核的终止申请',
          HttpStatus.CONFLICT,
        );
      }

      const [result] = await this.db
        .insert(terminationRequests)
        .values({
          contractId: dto.contractId,
          contractNo: contract.contractNo,
          tenant: contract.tenant,
          terminationDate: dto.terminationDate,
          amendmentNo: dto.amendmentNo || null,
          status: 'pending',
          creator,
        })
        .returning();

      return result as TerminationRequest;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        '创建终止申请失败',
        JSON.stringify(error),
      );
      throw error;
    }
  }

  async review(
    id: string,
    dto: ReviewTerminationDto,
    reviewer: string,
  ): Promise<TerminationRequest> {
    try {
      // 1. 查找终止申请
      const [request] = await this.db
        .select()
        .from(terminationRequests)
        .where(eq(terminationRequests.id, id))
        .limit(1);

      if (!request) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '终止申请不存在',
          HttpStatus.NOT_FOUND,
        );
      }

      if (request.status !== 'pending') {
        throw new BusinessException(
          ResponseCode.BUSINESS_ERROR,
          '仅待审核的申请可操作',
          HttpStatus.BAD_REQUEST,
        );
      }

      const newStatus =
        dto.action === 'approve' ? 'approved' : 'rejected';

      // 按比例金额计算为纯读取，事务外执行（不依赖事务内写入）
      const prorated =
        dto.action === 'approve'
          ? await this.checkPeriod(request.contractId, request.terminationDate)
          : null;

      // 申请单状态与合同/台账变更同事务：任一步失败整体回滚，申请保持 pending
      await this.db.transaction(async (tx) => {
        await tx
          .update(terminationRequests)
          .set({
            status: newStatus,
            reviewedBy: reviewer,
            rejectReason:
              dto.action === 'reject' ? dto.remark : null,
            reviewRemark: dto.remark || null,
          })
          .where(eq(terminationRequests.id, id));

        if (dto.action === 'approve') {
          await tx
            .update(contracts)
            .set({
              status: 'terminated',
              terminationDate: request.terminationDate,
              reviewer,
            })
            .where(eq(contracts.id, request.contractId));

          const terminationMonth = request.terminationDate.substring(0, 7);
          await tx
            .update(ledgerItems)
            .set({ status: 'terminated', updatedAt: new Date() as any })
            .where(
              and(
                eq(ledgerItems.contractId, request.contractId),
                gt(ledgerItems.period, terminationMonth),
              ),
            );

          // 终止月内阶段起始日晚于终止日的台账行同样不再计费（口径与 checkPeriod 的 itemsAfterTerm 一致）
          await tx
            .update(ledgerItems)
            .set({ status: 'terminated', updatedAt: new Date() as any })
            .where(
              and(
                eq(ledgerItems.contractId, request.contractId),
                eq(ledgerItems.period, terminationMonth),
                gt(ledgerItems.stageStartDate, request.terminationDate),
              ),
            );

          if (prorated?.targetLedgerId) {
            await tx
              .update(ledgerItems)
              .set({
                amendmentNo: request.amendmentNo || null,
                amendmentRent: prorated.proratedRent,
                amendmentPropertyFee: prorated.proratedPropertyFee,
                updatedAt: new Date() as any,
              })
              .where(eq(ledgerItems.id, prorated.targetLedgerId));
            this.logger.log(
              `已更新台账 ${prorated.targetLedgerId} 终止按比例金额: 租金=${prorated.proratedRent}, 物业费=${prorated.proratedPropertyFee}`,
            );
          }
        }
      });

      if (dto.action === 'approve') {
        // 外部副作用放在事务提交之后，失败不回滚终止结果
        try {
          const contractRows = await this.db
            .select({ propertyId: contracts.propertyId })
            .from(contracts)
            .where(eq(contracts.id, request.contractId))
            .limit(1);
          let propertyName: string | undefined;
          if (contractRows[0]?.propertyId) {
            const propRows = await this.db
              .select({ name: properties.name })
              .from(properties)
              .where(eq(properties.id, contractRows[0].propertyId))
              .limit(1);
            propertyName = propRows[0]?.name;
          }
          await this.utilityService.deactivateTenantIfNoActiveContract(
            request.tenant,
            propertyName,
          );
        } catch (err) {
          this.logger.error(
            `终止后停用水电费租户失败（不影响终止结果）: ${request.tenant}`,
            JSON.stringify(err),
          );
        }

      }

      return {
        ...request,
        status: newStatus,
        reviewedBy: reviewer,
        rejectReason: dto.action === 'reject' ? dto.remark : null,
        reviewRemark: dto.remark || null,
      } as unknown as TerminationRequest;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        '审核终止申请失败',
        JSON.stringify(error),
      );
      throw error;
    }
  }

  async withdraw(id: string): Promise<TerminationRequest> {
    try {
      const [request] = await this.db
        .select()
        .from(terminationRequests)
        .where(eq(terminationRequests.id, id))
        .limit(1);

      if (!request) {
        throw new BusinessException(
          ResponseCode.NOT_FOUND,
          '终止申请不存在',
          HttpStatus.NOT_FOUND,
        );
      }

      if (request.status !== 'pending') {
        throw new BusinessException(
          ResponseCode.BUSINESS_ERROR,
          '仅待审核的申请可撤回',
          HttpStatus.BAD_REQUEST,
        );
      }

      const [updated] = await this.db
        .update(terminationRequests)
        .set({ status: 'rejected', rejectReason: '申请人主动撤回' })
        .where(eq(terminationRequests.id, id))
        .returning();

      return updated as TerminationRequest;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        '撤回终止申请失败',
        JSON.stringify(error),
      );
      throw error;
    }
  }
}
