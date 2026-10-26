/**
 * ContractService 聚焦单元测试
 *
 * 覆盖核心金额计算（按月折算、四舍五入）、缴纳期限计算（提前天数跨月）、
 * 台账生成（月付/季付），以及合同审核状态机流转守卫。
 * 通过 mock drizzle 数据库链，不依赖真实数据库。
 */
import { ContractService } from '@server/modules/contract/contract.service';
import { contracts, ledgerItems } from '@server/database/schema';

jest.mock('@lark-apaas/fullstack-nestjs-core', () => ({
  DRIZZLE_DATABASE: Symbol('DRIZZLE_DATABASE'),
}));

// ==================== 数据库 mock ====================

// select 结果按调用顺序（FIFO）消费；insert/update 记录写入值供断言
type DbMockWithQueue = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  inserts: Array<{ table: unknown; values: unknown }>;
  updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  __selectQueue: unknown[][];
};

function createQueueDatabase(): DbMockWithQueue {
  const selectQueue: unknown[][] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];

  function chain(resolve: () => unknown): any {
    const obj: any = {
      from: () => obj,
      where: () => obj,
      orderBy: () => obj,
      limit: () => obj,
      offset: () => obj,
      returning: () => obj,
      set: (values: Record<string, unknown>) => {
        const record = updates[updates.length - 1];
        if (record) record.values = values;
        return obj;
      },
      values: (v: unknown) => {
        const record = inserts[inserts.length - 1];
        if (record) record.values = v;
        return obj;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(res, rej),
    };
    return obj;
  }

  const db: any = {
    select: jest.fn(() => chain(() => selectQueue.shift() ?? [])),
    insert: jest.fn((table: unknown) => {
      inserts.push({ table, values: undefined });
      return chain(() => [{ id: `gen-${inserts.length}` }]);
    }),
    update: jest.fn((table: unknown) => {
      updates.push({ table, values: {} });
      return chain(() => []);
    }),
    delete: jest.fn(() => chain(() => [])),
    // 事务 mock：直接以同一个 db 句柄作为 tx 执行回调（不模拟回滚）
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    inserts,
    updates,
    __selectQueue: selectQueue,
  };
  return db as DbMockWithQueue;
}

// ==================== 测试用数据构造 ====================

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    contractNo: 'HT-2025-001',
    contractType: 'new_contract',
    parentContractId: null,
    propertyId: null,
    landlord: '甲方公司',
    tenant: '乙方公司',
    startDate: '2025-01-15',
    endDate: '2025-03-10',
    hasUtilities: false,
    paymentMethod: 'monthly',
    advancePaymentDays: 5,
    status: 'pending',
    terminationDate: null,
    signDate: null,
    leaseAddress: null,
    leaseArea: null,
    reviewRemark: null,
    reviewer: null,
    creator: 'tester',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T03:04:05Z'),
    ...overrides,
  };
}

function makeStage(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    contractId: 'c-1',
    startDate: '2025-01-15',
    endDate: '2025-03-10',
    monthlyRent: 3100,
    monthlyPropertyFee: 310,
    stageOrder: 0,
    stageType: null,
    ...overrides,
  };
}

function makeService(db: unknown) {
  const utilityService = { ensureTenant: jest.fn().mockResolvedValue(undefined) };
  const service = new ContractService(db as any, utilityService as any);
  return { service, utilityService };
}

// ==================== 金额与日期计算 ====================

describe('ContractService 金额与日期计算', () => {
  let service: ContractService;

  beforeEach(() => {
    service = makeService(createQueueDatabase()).service;
  });

  test('getMonthsInRange 跨月拆分：每月起止与天数正确', () => {
    const months = (service as any).getMonthsInRange(
      new Date(2025, 0, 15),
      new Date(2025, 2, 10)
    );

    expect(months).toHaveLength(3);
    expect(months[0].period).toBe('2025-01');
    expect(months[0].daysInMonth).toBe(31);
    expect(months[0].stageDays).toBe(17); // 1/15 ~ 1/31
    expect(months[1].period).toBe('2025-02');
    expect(months[1].stageDays).toBe(28); // 2025 年 2 月
    expect(months[2].period).toBe('2025-03');
    expect(months[2].stageDays).toBe(10); // 3/1 ~ 3/10
  });

  test('calcMonthlyAmount 整月不折算，返回全额', () => {
    const monthInfo = {
      period: '2025-02',
      stageStart: new Date(2025, 1, 1),
      stageEnd: new Date(2025, 1, 28),
      daysInMonth: 28,
      stageDays: 28,
    };
    const { rent, propertyFee } = (service as any).calcMonthlyAmount(
      monthInfo,
      new Date(2025, 0, 15),
      new Date(2025, 2, 10),
      3100,
      310,
      'monthly'
    );
    expect(rent).toBe(3100);
    expect(propertyFee).toBe(310);
  });

  test('calcMonthlyAmount 首尾月按天数比例折算并保留两位小数', () => {
    const stageStart = new Date(2025, 0, 15);
    const stageEnd = new Date(2025, 2, 10);

    const firstMonth = (service as any).calcMonthlyAmount(
      {
        period: '2025-01',
        stageStart: new Date(2025, 0, 15),
        stageEnd: new Date(2025, 0, 31),
        daysInMonth: 31,
        stageDays: 17,
      },
      stageStart,
      stageEnd,
      1000,
      100,
      'monthly'
    );
    expect(firstMonth.rent).toBeCloseTo(Math.round((1000 * 17 / 31) * 100) / 100, 10);
    expect(firstMonth.propertyFee).toBeCloseTo(Math.round((100 * 17 / 31) * 100) / 100, 10);

    const lastMonth = (service as any).calcMonthlyAmount(
      {
        period: '2025-03',
        stageStart: new Date(2025, 2, 1),
        stageEnd: new Date(2025, 2, 10),
        daysInMonth: 31,
        stageDays: 10,
      },
      stageStart,
      stageEnd,
      3100,
      310,
      'monthly'
    );
    expect(lastMonth.rent).toBe(1000); // 3100 * 10/31
    expect(lastMonth.propertyFee).toBe(100); // 310 * 10/31
  });

  test('calcDueDate 提前天数跨月回退', () => {
    expect((service as any).calcDueDate(new Date(2025, 2, 5), 10)).toBe('2025-02-23');
    expect((service as any).calcDueDate(new Date(2025, 0, 15), 5)).toBe('2025-01-10');
    expect((service as any).calcDueDate(new Date(2025, 1, 1), 5)).toBe('2025-01-27');
  });

  test('parseDateLocal 与 formatDateLocal 按本地时区往返一致', () => {
    const parsed = (service as any).parseDateLocal('2025-02-28');
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(1);
    expect(parsed.getDate()).toBe(28);
    expect((service as any).formatDateLocal(parsed)).toBe('2025-02-28');
  });
});

// ==================== 审核状态机 ====================

describe('ContractService 审核状态机', () => {
  test('草稿合同可提交审核，状态更新为 pending', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'draft' })]);
    const { service } = makeService(db);

    await service.submitForReview('c-1');

    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].table).toBe(contracts);
    expect(db.updates[0].values).toMatchObject({ status: 'pending' });
  });

  test('被驳回合同可重新提交审核', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'rejected' })]);
    const { service } = makeService(db);

    await service.submitForReview('c-1');

    expect(db.updates[0].values).toMatchObject({ status: 'pending' });
  });

  test.each(['pending', 'approved', 'terminated'] as const)(
    '状态为 %s 的合同不允许提交审核',
    async (status) => {
      const db = createQueueDatabase();
      db.__selectQueue.push([makeContract({ status })]);
      const { service } = makeService(db);

      await expect(service.submitForReview('c-1')).rejects.toThrow(
        '仅草稿或被驳回状态的合同可以提交审核'
      );
      expect(db.updates).toHaveLength(0);
    }
  );

  test('仅待审核状态的合同可以审核', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'draft' })]);
    const { service } = makeService(db);

    await expect(service.review('c-1', 'approve', '', '审核员')).rejects.toThrow(
      '仅待审核状态的合同可以审核'
    );
  });

  test('审核驳回：状态置为 rejected 并记录审核人，不触发台账生成', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'pending' })]);
    const { service } = makeService(db);

    await service.review('c-1', 'reject', '金额有误', '审核员');

    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].values).toMatchObject({
      status: 'rejected',
      reviewRemark: '金额有误',
      reviewer: '审核员',
    });
    expect(db.inserts).toHaveLength(0);
  });

  test('已审核通过的合同不可删除', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'approved' })]);
    const { service } = makeService(db);

    await expect(service.remove('c-1')).rejects.toThrow('已审核通过的合同不可删除');
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('仅草稿或被驳回状态的合同可以编辑', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'approved' })]);
    const { service } = makeService(db);

    await expect(service.update('c-1', { tenant: '新租户' })).rejects.toThrow(
      '仅草稿或被驳回状态的合同可以编辑'
    );
  });

  test('仅已审核通过的合同可以发起变更', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract({ status: 'pending' })]);
    const { service } = makeService(db);

    await expect(
      service.createAmendment(
        {
          contractId: 'c-1',
          changeType: 'rent_change',
          changeStartDate: '2025-04-01',
          changeEndDate: '2025-06-30',
          stages: [],
        } as any,
        'tester'
      )
    ).rejects.toThrow('仅已审核通过的合同可以变更');
  });
});

// ==================== 台账生成（审核通过联动） ====================

describe('ContractService 台账生成', () => {
  test('月付合同审核通过后生成折算正确的台账明细', async () => {
    const db = createQueueDatabase();
    const contract = makeContract({
      paymentMethod: 'monthly',
      advancePaymentDays: 5,
    });
    // 调用顺序：review 查合同 → generateLedger 查合同 → 查阶段 → 查台账
    db.__selectQueue.push(
      [contract],
      [contract],
      [makeStage()],
      []
    );
    const { service } = makeService(db);

    await service.review('c-1', 'approve', '通过', '审核员');

    // 合同状态更新为 approved
    expect(db.updates[0].values).toMatchObject({ status: 'approved' });

    // 台账写入：3 条明细，金额按天折算
    const ledgerInsert = db.inserts.find((i) => i.table === ledgerItems);
    expect(ledgerInsert).toBeDefined();
    const rows = ledgerInsert!.values as any[];
    expect(rows).toHaveLength(3);

    expect(rows[0]).toMatchObject({
      period: '2025-01',
      stageStartDate: '2025-01-15',
      monthlyRent: 1700, // 3100 * 17/31
      monthlyPropertyFee: 170, // 310 * 17/31
      status: 'unpaid',
      dueDate: '2025-01-10', // 1/15 - 5 天
    });
    expect(rows[1]).toMatchObject({
      period: '2025-02',
      monthlyRent: 3100,
      monthlyPropertyFee: 310,
      dueDate: '2025-01-27', // 2/1 - 5 天
    });
    expect(rows[2]).toMatchObject({
      period: '2025-03',
      monthlyRent: 1000, // 3100 * 10/31
      monthlyPropertyFee: 100, // 310 * 10/31
      dueDate: '2025-02-24', // 3/1 - 5 天
    });
  });

  test('免租期（租金与物业费均为 0）生成的台账行状态为 no_payment_required', async () => {
    const db = createQueueDatabase();
    const contract = makeContract({
      paymentMethod: 'monthly',
      advancePaymentDays: 5,
    });
    const zeroStage = makeStage({ monthlyRent: 0, monthlyPropertyFee: 0 });
    db.__selectQueue.push([contract], [contract], [zeroStage], [contract], []);
    const { service } = makeService(db);

    await service.review('c-1', 'approve', '', '审核员');

    const rows = db.inserts.find((i) => i.table === ledgerItems)!.values as any[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('no_payment_required');
    }
  });

  test('季付合同台账带季度标签，同季度共享最早缴纳期限', async () => {
    const db = createQueueDatabase();
    const contract = makeContract({
      paymentMethod: 'quarterly',
      advancePaymentDays: 10,
      startDate: '2025-01-15',
      endDate: '2025-02-28',
    });
    const stage = makeStage({ startDate: '2025-01-15', endDate: '2025-02-28' });
    db.__selectQueue.push([contract], [contract], [stage], [contract], []);
    const { service } = makeService(db);

    await service.review('c-1', 'approve', '', '审核员');

    const rows = db.inserts.find((i) => i.table === ledgerItems)!.values as any[];
    expect(rows).toHaveLength(2);
    // 季度标签
    expect(rows[0].quarter).toBe('2025-Q1');
    expect(rows[1].quarter).toBe('2025-Q1');
    // 同季度共享缴纳期限 = 最早阶段起始日 1/15 - 10 天
    expect(rows[0].dueDate).toBe('2025-01-05');
    expect(rows[1].dueDate).toBe('2025-01-05');
  });

  test('无阶段数据时跳过台账生成，不产生写入', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeContract()], [makeContract()], []);
    const { service } = makeService(db);

    await service.review('c-1', 'approve', '', '审核员');

    expect(db.inserts.filter((i) => i.table === ledgerItems)).toHaveLength(0);
  });
});

// ==================== 变更应用到台账（applyAmendmentToLedger） ====================

describe('ContractService 变更应用状态重算', () => {
  const makeLedgerRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'lg-1',
    period: '2025-02',
    stageStartDate: '2025-02-01',
    monthlyRent: 3100,
    monthlyPropertyFee: 310,
    rentReceived: 0,
    propertyFeeReceived: 0,
    receiveDate: null,
    status: 'unpaid',
    ...overrides,
  });

  test('变更把该期减免为免租（双 0）时状态重算为 no_payment_required', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeLedgerRow()]);
    const { service } = makeService(db);

    await (service as any).applyAmendmentToLedger('c-1', 'BC-001', [
      { period: '2025-02', startDate: '2025-02-01', endDate: '2025-02-28', monthlyRent: 0, monthlyPropertyFee: 0 },
    ]);

    expect(db.updates[0].values).toMatchObject({
      amendmentNo: 'BC-001',
      amendmentRent: 0,
      amendmentPropertyFee: 0,
      status: 'no_payment_required',
    });
  });

  test('变更后仍有应收且无收款时状态回落 unpaid；已终止行不覆盖状态', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([
      makeLedgerRow({ id: 'lg-1', status: 'no_payment_required' }),
      makeLedgerRow({ id: 'lg-2', stageStartDate: '2025-03-01', period: '2025-03', status: 'terminated' }),
    ]);
    const { service } = makeService(db);

    await (service as any).applyAmendmentToLedger('c-1', 'BC-002', [
      { period: '2025-02', startDate: '2025-02-01', endDate: '2025-02-28', monthlyRent: 3000, monthlyPropertyFee: 300 },
      { period: '2025-03', startDate: '2025-03-01', endDate: '2025-03-31', monthlyRent: 3000, monthlyPropertyFee: 300 },
    ]);

    expect(db.updates[0].values).toMatchObject({ status: 'unpaid' });
    expect(db.updates[1].values).not.toHaveProperty('status');
  });
});

// ==================== 列表时间字段透传 ====================

describe('ContractService 列表时间字段', () => {
  it('findAll 透出签署日期与创建、修改时间的 ISO 串', async () => {
    const db = createQueueDatabase();
    // 消费顺序：列表行 → 计数 → 租期分段 → 变更记录（无房产、无变更时后两条查询不触发）
    db.__selectQueue.push(
      [makeContract({ signDate: '2025-01-10' })],
      [{ count: 1 }],
      [],
      [],
    );
    const { service } = makeService(db);

    const result = await service.findAll({ page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      signDate: '2025-01-10',
      _createdAt: '2025-01-01T00:00:00.000Z',
      _updatedAt: '2025-01-02T03:04:05.000Z',
    });
  });
});
