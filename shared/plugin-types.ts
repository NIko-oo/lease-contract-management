// ---- plugin:send_feishu_overdue_notification_1 ----
// ============================================================
// 插件 send_feishu_overdue_notification_1 (逾期查询提醒飞书通知) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface SendFeishuOverdueNotificationOneInput {
  /** 跟进人员用户ID列表 */
  follower_user_ids: string[];
  /** 逾期租金物业费明细内容 */
  rent_property_overdue_detail: string;
  /** 逾期水电费明细内容 */
  utility_overdue_detail: string;
  /** 水电费未登记汇总内容 */
  utility_unregistered_summary: string;
}

/**
 * capabilityClient.load('send_feishu_overdue_notification_1').call<SendFeishuOverdueNotificationOneOutput>('send_feishu_message', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface SendFeishuOverdueNotificationOneOutput {
  /** 是否成功 */
  success: boolean;
}
// ---- end:send_feishu_overdue_notification_1 ----