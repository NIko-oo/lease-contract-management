/**
 * ReceiptService 聚焦单元测试
 *
 * 覆盖收款报表服务的核心逻辑：create 前置校验、台账收款（应收上限/单位数量换算/
 * 台账回写状态机）、水电费收款（水/电拆分/单价换算）、findAll 六项过滤与分页、
 * remove/updateInvoice 基本路径。
 * 通过 mock drizzle 数据库链（FIFO select 队列），不依赖真实数据库。
 */
import { ReceiptService } from '@server/modules/receipt/receipt.service';
import {
  receiveRecords,
  ledgerItems,
  utilityRecords,
} from '@server/database/schema';

jest.mock('@lark-apaas/fullstack-nestjs-core', () => ({
  DRIZZLE_DATABASE: Symbol('DRIZZLE_DATABASE'),
}));

// ==================== 数据库 mock ====================

// select 结果按调用顺序（FIFO）消费；insert/update 记录写入值供断言；
// calls 记录链式调用（method + args），用于断言 where/limit/offset 等参数
type ChainCall = { method: string; args: unknown[] };

type DbMockWithQueue = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  inserts: Array<{ table: unknown; values: unknown }>;
  updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  calls: ChainCall[];
  __selectQueue: unknown[][];
};

function createQueueDatabase(): DbMockWithQueue {
  const selectQueue: unknown[][] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const calls: ChainCall[] = [];

  function chain(resolve: () => unknown): any {
    const obj: any = {};
    [
      'from',
      'where',
      'orderBy',
      'limit',
      'offset',
      'returning',
      'leftJoin',
      'groupBy',
      'set',
      'values',
    ].forEach((method) => {
      obj[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        if (method === 'set') {
          const record = updates[updates.length - 1];
          if (record) record.values = args[0] as Record<string, unknown>;
        }
        if (method === 'values') {
          const record = inserts[inserts.length - 1];
          if (record) record.values = args[0];
        }
        return obj;
      };
    });
    obj.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(res, rej);
    return obj;
  }

  const db: any = {
    transaction: jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(db)),
    select: jest.fn(() => chain(() => selectQueue.shift() ?? [])),
    insert: jest.fn((table: unknown) => {
      const record = { table, values: undefined };
      inserts.push(record);
      return chain(() => {
        const v = record.values as unknown;
        const n = Array.isArray(v) ? v.length : 1;
        return Array.from({ length: n }, (_, i) => ({ id: `gen-${inserts.length}-${i}` }));
      });
    }),
    update: jest.fn((table: unknown) => {
      updates.push({ table, values: {} });
      return chain(() => []);
    }),
    delete: jest.fn(() => chain(() => [])),
    inserts,
    updates,
    calls,
    __selectQueue: selectQueue,
  };
  return db as DbMockWithQueue;
}

// ==================== 测试用数据构造 ====================

function makeLedgerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lg-1',
    contractId: 'c-1',
    contractNo: 'HT-2025-001',
    tenant: '乙方公司',
    period: '2025-07',
    stageStartDate: '2025-07-01',
    stageEndDate: '2025-07-31',
    monthlyRent: 3000,
    monthlyPropertyFee: 300,
    amendmentRent: null,
    amendmentPropertyFee: null,
    paymentMethod: 'monthly',
    dueDate: '2025-06-25',
    rentReceived: 0,
    propertyFeeReceived: 0,
    receiveDate: null,
    status: 'unpaid',
    quarter: null,
    propertyName: '幸福大厦',
    landlord: '甲方公司',
    ...overrides,
  };
}

function makeUtilityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    contractId: 'c-1',
    contractNo: 'HT-2025-001',
    tenant: '乙方公司',
    period: '2025-07',
    waterUsage: 20,
    waterPrice: 3,
    electricityUsage: 100,
    electricityPrice: 1.2,
    totalWaterFee: 60,
    totalElectricityFee: 120,
    electricityReceived: 0,
    waterReceived: 0,
    receiveDate: null,
    recordDate: '2025-07-31',
    ...overrides,
  };
}

function makeReceiveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    propertyName: '幸福大厦',
    contractId: 'c-1',
    contractNo: 'HT-2025-001',
    tenant: '乙方公司',
    customerCode: 'KH-001',
    receiveType: 'rent',
    receiveDate: '2025-07-05',
    period: '2025-07',
    unit: '面积',
    unitQty: 120,
    amount: 3000,
    invoiceNo: null,
    refId: 'lg-1',
    ...overrides,
  };
}

function makeService(db: unknown) {
  const service = new ReceiptService(db as any);
  return { service };
}

// ==================== create 前置校验 ====================

describe('ReceiptService create 前置校验', () => {
  let service: ReceiptService;

  beforeEach(() => {
    service = makeService(createQueueDatabase()).service;
  });

  test('空 items 拒绝', async () => {
    await expect(
      service.create({ refType: 'ledger', refId: 'lg-1', items: [] } as any, 'u-100'),
    ).rejects.toThrow('至少录入一条收款记录');
  });

  test('收款金额必须大于 0', async () => {
    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [
            { receiveType: 'rent', amount: 0, receiveDate: '2025-07-05', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('收款金额必须大于 0');
  });

  test('收款日期必填', async () => {
    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [{ receiveType: 'rent', amount: 100, receiveDate: '', period: '2025-07' }],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('收款日期必填');
  });

  test('款项所属期必填', async () => {
    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [{ receiveType: 'rent', amount: 100, receiveDate: '2025-07-05', period: '' }],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('款项所属期必填');
  });
});

// ==================== 台账收款（createFromLedger） ====================

describe('ReceiptService 台账收款', () => {
  test('拒绝非租金/物业费类型', async () => {
    const db = createQueueDatabase();
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [
            { receiveType: 'water', amount: 50, receiveDate: '2025-07-05', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('台账收款仅支持租金/物业费类型');
    expect(db.inserts).toHaveLength(0);
  });

  test('台账记录不存在抛 NotFound', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-none',
          items: [
            { receiveType: 'rent', amount: 100, receiveDate: '2025-07-05', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('台账记录不存在');
  });

  test('合同终止后的台账期间拒绝收款', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeLedgerRow({ status: 'terminated' })]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [
            { receiveType: 'rent', amount: 100, receiveDate: '2025-07-05', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('该台账记录所属期已在合同终止后，不可录入收款');
    expect(db.inserts).toHaveLength(0);
  });

  test('多期间中包含不存在的期间拒绝', async () => {
    const db = createQueueDatabase();
    const ledger = makeLedgerRow();
    // #1 源台账 #2 期间行（仅 2025-07，无 2025-08）
    db.__selectQueue.push([ledger], [ledger]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [
            { receiveType: 'rent', amount: 1000, receiveDate: '2025-07-05', period: '2025-07' },
            { receiveType: 'rent', amount: 1000, receiveDate: '2025-08-05', period: '2025-08' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('台账期间 2025-08 不存在');
  });

  test('本次合计 + 已有收款超应收租金上限时拒绝', async () => {
    const db = createQueueDatabase();
    const ledger = makeLedgerRow();
    db.__selectQueue.push(
      [ledger], // #1 源台账
      [ledger], // #2 期间行
      [{ period: '2025-07', receiveType: 'rent', total: 1500 }], // #3 已有聚合
    );
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-1',
          items: [
            { receiveType: 'rent', amount: 2000, receiveDate: '2025-07-05', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('已收租金不能超过应收租金 3000');
    expect(db.inserts).toHaveLength(0);
  });

  test('租金+物业费一次收取：unitQty 换算与台账回写状态正确', async () => {
    const db = createQueueDatabase();
    const ledger = makeLedgerRow();
    db.__selectQueue.push(
      [ledger], // #1 源台账
      [ledger], // #2 期间行
      [], // #3 已有聚合（无）
      [{ propertyName: '幸福大厦', leaseArea: 120 }], // #4 contracts+properties
      [{ customerCode: 'KH-001' }], // #5 customers
      [
        // #6 aggregateReceive（插入后）
        { receiveType: 'rent', total: 3000 },
        { receiveType: 'property_fee', total: 300 },
      ],
      [{ maxDate: '2025-07-05' }], // #7 maxReceiveDate
      [ledger], // #8 回写目标台账行
      [], // #9 utilityRows（无水电）
    );
    const { service } = makeService(db);

    const inserted = await service.create(
      {
        refType: 'ledger',
        refId: 'lg-1',
        items: [
          { receiveType: 'rent', amount: 3000, receiveDate: '2025-07-05', period: '2025-07' },
          { receiveType: 'property_fee', amount: 300, receiveDate: '2025-07-05', period: '2025-07' },
        ],
      } as any,
      'u-100',
    );

    // 插入 2 条收款记录，单位与数量正确
    const recInsert = db.inserts.find((i) => i.table === receiveRecords);
    expect(recInsert).toBeDefined();
    const rows = recInsert!.values as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      propertyName: '幸福大厦',
      contractNo: 'HT-2025-001',
      tenant: '乙方公司',
      customerCode: 'KH-001',
      receiveType: 'rent',
      unit: '面积',
      unitQty: 120, // 租金单位数量 = 合同租赁面积
      amount: 3000,
      createdBy: 'u-100',
    });
    expect(rows[1]).toMatchObject({
      receiveType: 'property_fee',
      unit: '月',
      unitQty: 1, // 300 / 月物业费 300
      amount: 300,
    });

    // 台账回写：应收已收齐 → paid
    const ledgerUpdate = db.updates.find((u) => u.table === ledgerItems);
    expect(ledgerUpdate).toBeDefined();
    expect(ledgerUpdate!.values).toMatchObject({
      rentReceived: 3000,
      propertyFeeReceived: 300,
      receiveDate: '2025-07-05',
      status: 'paid',
    });

    expect(inserted).toHaveLength(2);
  });

  test('部分收款时台账状态为 partial', async () => {
    const db = createQueueDatabase();
    const ledger = makeLedgerRow();
    db.__selectQueue.push(
      [ledger],
      [ledger],
      [],
      [{ propertyName: null, leaseArea: null }],
      [],
      [{ receiveType: 'rent', total: 1000 }], // 仅收 1000/3000
      [{ maxDate: '2025-07-05' }],
      [ledger],
      [
        makeLedgerRow({
          rentReceived: 1000,
          propertyFeeReceived: 0,
          receiveDate: '2025-07-05',
          status: 'partial',
        }),
      ],
      [],
    );
    const { service } = makeService(db);

    await service.create(
      {
        refType: 'ledger',
        refId: 'lg-1',
        items: [
          { receiveType: 'rent', amount: 1000, receiveDate: '2025-07-05', period: '2025-07' },
        ],
      } as any,
      'u-100',
    );

    // 租户编码匹配不到客户时留空，不阻断
    const recInsert = db.inserts.find((i) => i.table === receiveRecords);
    expect((recInsert!.values as any[])[0].customerCode).toBeNull();

    const ledgerUpdate = db.updates.find((u) => u.table === ledgerItems);
    expect(ledgerUpdate!.values).toMatchObject({
      rentReceived: 1000,
      propertyFeeReceived: 0,
      status: 'partial',
    });
  });

  // 线上事故回归：DEMO-2026-0001 的 2026-10 拆成两行（10-01~10-15 / 10-16~10-31），
  // 旧口径拿单行应收做上限，导致「一键收齐」按期算出的金额必然超上限、录入失败。
  test('同月两行台账：跨行收款按期聚合可通过并逐行分摊回写', async () => {
    const rowA = makeLedgerRow({
      id: 'lg-a',
      period: '2026-10',
      stageStartDate: '2026-10-01',
      stageEndDate: '2026-10-15',
      monthlyRent: 3000,
      monthlyPropertyFee: 1817.42,
      rentReceived: 3000,
      propertyFeeReceived: 1802.88,
      status: 'partial',
    });
    const rowB = makeLedgerRow({
      id: 'lg-b',
      period: '2026-10',
      stageStartDate: '2026-10-16',
      stageEndDate: '2026-10-31',
      monthlyRent: 3000,
      monthlyPropertyFee: 1938.58,
      rentReceived: 3000,
      propertyFeeReceived: 0,
      status: 'partial',
    });

    const db = createQueueDatabase();
    db.__selectQueue.push(
      [rowA], // #1 源台账（点的是前半行）
      [rowA, rowB], // #2 该期全部台账行
      [
        // #3 已有收款（期聚合）：期应收物业费 = 1817.42 + 1938.58 = 3756
        { period: '2026-10', receiveType: 'rent', total: 6000 },
        { period: '2026-10', receiveType: 'property_fee', total: 1802.88 },
      ],
      [{ propertyName: '幸福大厦', leaseArea: 120 }], // #4 contracts+properties
      [{ customerCode: 'KH-001' }], // #5 customers
      [
        // #6 aggregateReceive（插入后）：1802.88 + 1938.58
        { receiveType: 'rent', total: 6000 },
        { receiveType: 'property_fee', total: 3741.46 },
      ],
      [{ maxDate: '2026-10-20' }], // #7 maxReceiveDate
      [rowA, rowB], // #8 该期台账行（按阶段起始日升序）
      [], // #9 utilityRows（本期无水电记录）
    );
    const { service } = makeService(db);

    const inserted = await service.create(
      {
        refType: 'ledger',
        refId: 'lg-a',
        items: [
          {
            receiveType: 'property_fee',
            amount: 1938.58,
            receiveDate: '2026-10-20',
            period: '2026-10',
          },
        ],
      } as any,
      'u-100',
    );

    // 物业费单位数量 = 本次金额 / 期应收（多行时一个月仍算一个月）
    const recInsert = db.inserts.find((i) => i.table === receiveRecords);
    expect((recInsert!.values as any[])[0]).toMatchObject({
      receiveType: 'property_fee',
      unitQty: 0.52, // 1938.58 / 3756
      amount: 1938.58,
    });

    const ledgerUpdates = db.updates.filter((u) => u.table === ledgerItems);
    expect(ledgerUpdates).toHaveLength(2);
    expect(ledgerUpdates[0].values).toMatchObject({
      rentReceived: 3000,
      propertyFeeReceived: 1817.42,
      receiveDate: '2026-10-20',
      status: 'paid',
    });
    expect(ledgerUpdates[1].values).toMatchObject({
      rentReceived: 3000,
      propertyFeeReceived: 1924.04,
      receiveDate: '2026-10-20',
      status: 'partial',
    });

    expect(inserted).toHaveLength(1);
  });

  test('期级上限仍然生效：本次 + 已有超该期应收合计被拒', async () => {
    const rowA = makeLedgerRow({
      id: 'lg-a',
      period: '2026-10',
      stageStartDate: '2026-10-01',
      monthlyPropertyFee: 1817.42,
    });
    const rowB = makeLedgerRow({
      id: 'lg-b',
      period: '2026-10',
      stageStartDate: '2026-10-16',
      monthlyPropertyFee: 1938.58,
    });

    const db = createQueueDatabase();
    db.__selectQueue.push(
      [rowA], // #1 源台账
      [rowA, rowB], // #2 该期全部台账行
      [{ period: '2026-10', receiveType: 'property_fee', total: 1802.88 }], // #3 已有收款
    );
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'ledger',
          refId: 'lg-a',
          items: [
            {
              receiveType: 'property_fee',
              amount: 2000,
              receiveDate: '2026-10-20',
              period: '2026-10',
            },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('已收物业费不能超过应收物业费 3756');
    expect(db.inserts).toHaveLength(0);
  });
});

// ==================== 水电费收款（createFromUtility） ====================

describe('ReceiptService 水电费收款', () => {
  test('拒绝非水费/电费类型', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeUtilityRow()]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'utility',
          refId: 'u-1',
          items: [
            { receiveType: 'rent', amount: 100, receiveDate: '2025-07-10', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('水电费收款仅支持水费/电费类型');
  });

  test('水电记录不存在抛 NotFound', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'utility',
          refId: 'u-none',
          items: [
            { receiveType: 'water', amount: 10, receiveDate: '2025-07-10', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('水电费记录不存在');
  });

  test('收款所属期必须与记录所属期一致', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeUtilityRow()]);
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'utility',
          refId: 'u-1',
          items: [
            { receiveType: 'water', amount: 10, receiveDate: '2025-07-10', period: '2025-06' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('水电费收款所属期必须与记录所属期一致');
  });

  test('超应收水费上限时拒绝', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [makeUtilityRow()], // 源水电记录 totalWaterFee=60
      [], // 校验时 aggregateReceive：无历史收款
    );
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'utility',
          refId: 'u-1',
          items: [
            { receiveType: 'water', amount: 61, receiveDate: '2025-07-10', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('不能超过应收水费 60');
    expect(db.inserts).toHaveLength(0);
  });

  test('水电超收按累计口径：历史已收 30 + 本次 31 超过应收 60 被拒', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [makeUtilityRow()], // totalWaterFee=60
      [{ receiveType: 'water', total: 30 }], // 校验时 aggregateReceive：已收 30
    );
    const { service } = makeService(db);

    await expect(
      service.create(
        {
          refType: 'utility',
          refId: 'u-1',
          items: [
            { receiveType: 'water', amount: 31, receiveDate: '2025-07-10', period: '2025-07' },
          ],
        } as any,
        'u-100',
      ),
    ).rejects.toThrow('不能超过应收水费 60');
    expect(db.inserts).toHaveLength(0);
  });

  test('水费+电费拆分收取：unitQty 按单价换算并回写水电记录', async () => {
    const db = createQueueDatabase();
    const utility = makeUtilityRow();
    db.__selectQueue.push(
      [utility], // #1 源水电记录
      [], // #2 校验时 aggregateReceive：无历史收款
      [{ propertyName: '幸福大厦', leaseArea: 120 }], // #3 contracts+properties
      [{ customerCode: 'KH-001' }], // #4 customers
      [
        // #5 aggregateReceive（插入后 syncBack）
        { receiveType: 'water', total: 60 },
        { receiveType: 'electricity', total: 120 },
      ],
      [{ maxDate: '2025-07-10' }], // #6 maxReceiveDate
      [], // #7 ledgerRows（无台账跳过）
      [utility], // #8 utilityRows
    );
    const { service } = makeService(db);

    const inserted = await service.create(
      {
        refType: 'utility',
        refId: 'u-1',
        items: [
          { receiveType: 'water', amount: 60, receiveDate: '2025-07-10', period: '2025-07' },
          { receiveType: 'electricity', amount: 120, receiveDate: '2025-07-10', period: '2025-07' },
        ],
      } as any,
      'u-100',
    );

    // 插入 2 条：水电拆分，单位数量按单价换算
    const recInsert = db.inserts.find((i) => i.table === receiveRecords);
    const rows = recInsert!.values as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      receiveType: 'water',
      unit: '吨',
      unitQty: 20, // 60 / 水价 3
      amount: 60,
      period: '2025-07',
    });
    expect(rows[1]).toMatchObject({
      receiveType: 'electricity',
      unit: '度',
      unitQty: 100, // 120 / 电价 1.2
      amount: 120,
    });

    // 水电记录回写
    const utilUpdate = db.updates.find((u) => u.table === utilityRecords);
    expect(utilUpdate).toBeDefined();
    expect(utilUpdate!.values).toMatchObject({
      waterReceived: 60,
      electricityReceived: 120,
      receiveDate: '2025-07-10',
    });

    expect(inserted).toHaveLength(2);
  });
});

// ==================== findAll 过滤与分页 ====================

describe('ReceiptService findAll', () => {
  test('全部过滤条件 + 第 2 页分页参数正确', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeReceiveRow()], [{ count: 1 }]);
    const { service } = makeService(db);

    const resp = await service.findAll({
      propertyName: '大厦',
      keyword: '乙',
      receiveType: 'rent',
      receiveStart: '2025-07-01',
      receiveEnd: '2025-07-31',
      period: '2025-07',
      page: 2,
      pageSize: 10,
    });

    expect(resp.items).toHaveLength(1);
    expect(resp.total).toBe(1);
    expect(resp.page).toBe(2);
    expect(resp.pageSize).toBe(10);

    // 列表、计数、全量聚合三个查询都传了同一 where（6 项过滤合并）
    const whereCalls = db.calls.filter((c) => c.method === 'where');
    expect(whereCalls).toHaveLength(3);
    whereCalls.forEach((call) => {
      expect(call.args[0]).toBe(whereCalls[0].args[0]);
    });

    // 分页：page=2, pageSize=10 → limit 10 offset 10
    const limitCalls = db.calls.filter((c) => c.method === 'limit');
    const offsetCalls = db.calls.filter((c) => c.method === 'offset');
    expect(limitCalls[0].args[0]).toBe(10);
    expect(offsetCalls[0].args[0]).toBe(10);
  });

  test('无过滤条件时列表查询不传 where，默认分页 offset=0', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeReceiveRow()], [{ count: 1 }]);
    const { service } = makeService(db);

    const resp = await service.findAll({ page: 1, pageSize: 20 });

    expect(resp.total).toBe(1);
    const whereCalls = db.calls.filter((c) => c.method === 'where');
    expect(whereCalls[0].args[0]).toBeUndefined();
    const offsetCalls = db.calls.filter((c) => c.method === 'offset');
    expect(offsetCalls[0].args[0]).toBe(0);
  });

  // 收款弹窗按「合同 + 所属期」列该期全部流水，contractId 必须真的进了 where
  test('contractId 过滤会生成 where 条件', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([makeReceiveRow()], [{ count: 1 }]);
    const { service } = makeService(db);

    await service.findAll({ contractId: 'c-1', period: '2026-10', page: 1, pageSize: 20 });

    const whereCalls = db.calls.filter((c) => c.method === 'where');
    expect(whereCalls[0].args[0]).toBeDefined();
  });
});

// ==================== remove / updateInvoice ====================

describe('ReceiptService remove 与 updateInvoice', () => {
  test('remove 删除不存在的记录抛 NotFound，不触发删除', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([]);
    const { service } = makeService(db);

    await expect(service.remove('rec-none', 'u-100')).rejects.toThrow('收款记录不存在');
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('remove 删除后按合同+期间回写', async () => {
    const db = createQueueDatabase();
    const rec = makeReceiveRow();
    db.__selectQueue.push(
      [rec], // #1 查收款记录
      [], // #2 aggregateReceive
      [], // #3 maxReceiveDate
      [], // #4 ledgerRows（无台账）
      [], // #5 utilityRows（无水电）
    );
    const { service } = makeService(db);

    await service.remove('rec-1', 'u-100');

    expect(db.delete).toHaveBeenCalledTimes(1);
    // 无台账/水电行时不做回写更新
    expect(db.updates).toHaveLength(0);
  });

  test('remove 后免租行（应收双 0）回写为 no_payment_required 而非 paid', async () => {
    const db = createQueueDatabase();
    const rec = makeReceiveRow();
    const zeroLedger = makeLedgerRow({
      monthlyRent: 0,
      monthlyPropertyFee: 0,
      status: 'paid',
    });
    db.__selectQueue.push(
      [rec], // #1 查收款记录
      [], // #2 aggregateReceive（删除后无剩余收款）
      [], // #3 maxReceiveDate
      [zeroLedger], // #4 ledgerRows
      [], // #5 utilityRows
    );
    const { service } = makeService(db);

    await service.remove('rec-1', 'u-100');

    const ledgerUpdate = db.updates.find((u) => u.table === ledgerItems);
    expect(ledgerUpdate).toBeDefined();
    expect(ledgerUpdate!.values).toMatchObject({ status: 'no_payment_required' });
  });

  test('updateInvoice 不存在抛 NotFound', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push([]);
    const { service } = makeService(db);

    await expect(service.updateInvoice('rec-none', 'FP-001', 'u-100')).rejects.toThrow(
      '收款记录不存在',
    );
  });

  test('updateInvoice 更新发票编号', async () => {
    const db = createQueueDatabase();
    const rec = makeReceiveRow();
    db.__selectQueue.push([rec], [rec]); // #1 查 #2 更新后重查
    const { service } = makeService(db);

    const updated = await service.updateInvoice('rec-1', 'FP-2025-001', 'u-100');

    expect(updated.id).toBe('rec-1');
    const invUpdate = db.updates.find((u) => u.table === receiveRecords);
    expect(invUpdate!.values).toMatchObject({
      invoiceNo: 'FP-2025-001',
      updatedBy: 'u-100',
    });
  });
});