/**
 * OverdueService 聚焦单元测试
 *
 * 覆盖租金逾期报表的应收口径：amendment_* 为 0（减免为全免）时应收必须是 0，
 * 不得按 falsy 回落原合同租金（回归：Number(x) || y 口径缺陷）。
 * 通过 mock drizzle 数据库链（FIFO select 队列），不依赖真实数据库。
 */
import { OverdueService } from '@server/modules/overdue/overdue.service';

jest.mock('@lark-apaas/fullstack-nestjs-core', () => ({
  DRIZZLE_DATABASE: Symbol.for('DRIZZLE_DATABASE'),
  CapabilityService: Symbol.for('CapabilityService'),
}));

type DbMock = {
  select: jest.Mock;
  __selectQueue: unknown[][];
} & Record<string, unknown>;

function createQueueDatabase(): DbMock {
  const selectQueue: unknown[][] = [];
  function chain(resolve: () => unknown): any {
    const obj: any = {};
    ['from', 'where', 'orderBy', 'limit', 'inArray'].forEach((method) => {
      obj[method] = () => obj;
    });
    obj.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res);
    return obj;
  }
  const db: any = {
    select: jest.fn(() => chain(() => selectQueue.shift() ?? [])),
    __selectQueue: selectQueue,
  };
  return db as DbMock;
}

function makeService(db: DbMock) {
  const capabilityService = { load: jest.fn() };
  return new OverdueService(db as any, capabilityService as any);
}

describe('OverdueService 租金逾期应收口径', () => {
  test('变更减免为 0 时应收按 0 计，不回落原合同租金', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [], // overdue_configs：无配置 → followerIds 为空
      [
        {
          contractNo: 'HT-1',
          period: '2025-07',
          monthlyRent: 3000,
          monthlyPropertyFee: 300,
          amendmentRent: 0,
          amendmentPropertyFee: 0,
          rentReceived: 0,
          propertyFeeReceived: 0,
          dueDate: '2025-06-25',
          tenant: '乙方公司',
          contractId: 'c-1',
          overdueDays: 5,
        },
      ],
    );
    const service = makeService(db);

    const { data } = await service.getRentOverdue();

    expect(data).toHaveLength(1);
    expect(data[0].receivableRent).toBe(0);
    expect(data[0].receivablePropertyFee).toBe(0);
  });

  test('未变更（amendment 为 null）时回落原合同租金', async () => {
    const db = createQueueDatabase();
    db.__selectQueue.push(
      [],
      [
        {
          contractNo: 'HT-2',
          period: '2025-08',
          monthlyRent: 3000,
          monthlyPropertyFee: 300,
          amendmentRent: null,
          amendmentPropertyFee: null,
          rentReceived: 1000,
          propertyFeeReceived: 0,
          dueDate: '2025-07-25',
          tenant: '乙方公司',
          contractId: 'c-2',
          overdueDays: 5,
        },
      ],
    );
    const service = makeService(db);

    const { data } = await service.getRentOverdue();

    expect(data[0].receivableRent).toBe(3000);
    expect(data[0].unpaidRent).toBe(2000);
  });
});
