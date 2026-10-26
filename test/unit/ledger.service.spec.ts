/**
 * LedgerService.getUnpaidPeriods 聚焦单元测试
 *
 * 收款弹窗的所属期下拉与「应收/已收」余额都取这里，口径为「合同 + 所属期」：
 * 同月多行（月中阶段拆分 / 变更生效）时应收是该期未终止行之和，
 * 已收是 receive_records 该期聚合。旧实现按行建 Map，后行覆盖前行，
 * 弹窗显示的单行应收与后端校验的期聚合已收不同维度，同月多行必然误判超收。
 * 通过 mock drizzle 数据库链（FIFO select 队列），不依赖真实数据库。
 */
import { LedgerService } from '@server/modules/ledger/ledger.service';

jest.mock('@lark-apaas/fullstack-nestjs-core', () => ({
  DRIZZLE_DATABASE: Symbol('DRIZZLE_DATABASE'),
}));

type DbMockWithQueue = {
  select: jest.Mock;
  __selectQueue: unknown[][];
};

function createQueueDatabase(): DbMockWithQueue {
  const selectQueue: unknown[][] = [];

  function chain(resolve: () => unknown): any {
    const obj: any = {};
    ['from', 'where', 'orderBy', 'groupBy', 'limit'].forEach((method) => {
      obj[method] = () => obj;
    });
    obj.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(res, rej);
    return obj;
  }

  const db: any = {
    select: jest.fn(() => chain(() => selectQueue.shift() ?? [])),
    __selectQueue: selectQueue,
  };
  return db as DbMockWithQueue;
}

function makeLedgerRow(overrides: Record<string, unknown> = {}) {
  return {
    period: '2026-10',
    monthlyRent: 3000,
    monthlyPropertyFee: 1817.42,
    amendmentRent: null,
    amendmentPropertyFee: null,
    ...overrides,
  };
}

function makeService(db: unknown) {
  return new LedgerService(db as any);
}

describe('LedgerService getUnpaidPeriods 期级口径', () => {
  test('同月两行合并为一期：应收取行之和，不被后行覆盖', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      // #1 该期两条未终止台账行（10-01~10-15 与 10-16~10-31）
      [
        makeLedgerRow(),
        makeLedgerRow({ monthlyPropertyFee: 1938.58 }),
      ],
      // #2 receive_records 期聚合
      [
        { period: '2026-10', receiveType: 'rent', total: 6000 },
        { period: '2026-10', receiveType: 'property_fee', total: 1802.88 },
      ],
    );

    const periods = await makeService(db).getUnpaidPeriods('c-1');

    expect(periods).toEqual([
      {
        period: '2026-10',
        receivableRent: 6000,
        receivablePropertyFee: 3756, // 1817.42 + 1938.58
        rentReceived: 6000,
        propertyFeeReceived: 1802.88,
      },
    ]);
  });

  test('租金与物业费都收齐的期不返回', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [makeLedgerRow(), makeLedgerRow({ monthlyPropertyFee: 1938.58 })],
      [
        { period: '2026-10', receiveType: 'rent', total: 6000 },
        { period: '2026-10', receiveType: 'property_fee', total: 3756 },
      ],
    );

    expect(await makeService(db).getUnpaidPeriods('c-1')).toEqual([]);
  });

  test('变更减免为 0 时应收按 0 计，不回退原合同金额', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [
        makeLedgerRow({
          period: '2026-11',
          amendmentRent: 0,
          amendmentPropertyFee: 0,
        }),
      ],
      [],
    );

    expect(await makeService(db).getUnpaidPeriods('c-1')).toEqual([]);
  });

  test('多个未收齐期按所属期升序返回', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [
        makeLedgerRow({ period: '2026-12' }),
        makeLedgerRow({ period: '2026-10' }),
      ],
      [],
    );

    const periods = await makeService(db).getUnpaidPeriods('c-1');
    expect(periods.map((p) => p.period)).toEqual(['2026-10', '2026-12']);
  });

  test('无 contractId 直接返回空，不查库', async () => {
    const db = createQueueDatabase();

    expect(await makeService(db).getUnpaidPeriods(undefined)).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
