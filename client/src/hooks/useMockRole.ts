/**
 * 角色标识须与妙搭平台应用角色 role_id 一致（authz 按此解析权限点）。
 * 总账会计在平台创建时由系统生成 ID，创建后不可修改，故此处沿用该 ID。
 */
export type MockRole =
  | 'super_admin'
  | 'finance'
  | 'administrative'
  | 'logistics'
  | 'role_99xxcvu983p';

export const DEFAULT_MOCK_ROLE: MockRole = 'super_admin';

export const ROLE_DISPLAY_NAMES: Record<MockRole, string> = {
  super_admin: '超级管理员',
  finance: '财务人员',
  administrative: '行政人员',
  logistics: '后勤人员',
  role_99xxcvu983p: '总账会计',
};

export const ROLE_DESCRIPTIONS: Record<MockRole, string> = {
  super_admin: '拥有系统所有权限',
  finance: '负责合同审核、台账管理、收款录入',
  administrative: '负责合同录入、终止申请、对账单生成',
  logistics: '负责水电费登记',
  role_99xxcvu983p: '只读查看系统内所有报表与明细，无任何数据操作权限',
};
