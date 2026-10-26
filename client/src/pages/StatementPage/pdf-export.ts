

import { ORG_SIGNATURE } from '@/config/organization';

export interface IPdfTenantStatement {
  companyName: string;
  tenantName: string;
  contracts: { contractNo: string; tenant: string; leaseAddress: string }[];
  ledgerRows: {
    contractNo: string;
    feeType: string;
    dateRange: string;
    dueAmount: string;
    paidAmount: string;
    unpaidAmount: string;
    dueDate: string;
  }[];
  ledgerSubtotal: { due: string; paid: string; unpaid: string };
  utilityRows: {
    feeType: string;
    period: string;
    usage: string;
    unitPrice: string;
    dueAmount: string;
    paidAmount: string;
    unpaidAmount: string;
  }[];
  utilitySubtotal?: { due: string; paid: string; unpaid: string };
  grandTotal: { due: string; paid: string; unpaid: string };
  creditCode?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankName?: string;
}



function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}





























export function renderPrintBody(s: IPdfTenantStatement): string {
  const PTD = 'border:1px solid #999;padding:6px 10px;font-size:13px;';
  const PTH = PTD + 'background:#f5f5f5;font-weight:500;';
  const PTD_R = PTD + 'text-align:right;font-variant-numeric:tabular-nums;';

  const parts: string[] = [];
  const p = (html: string) => parts.push(html);

  p(`<div style="text-align:center;margin-bottom:20px;">`);
  p(`<div style="font-size:20px;font-weight:700;margin-bottom:6px;">${esc(s.companyName)}</div>`);
  p(`<div style="font-size:24px;font-weight:700;">缴费通知单</div>`);
  p(`</div>`);

  p(`<div style="font-size:13px;font-weight:700;margin-bottom:6px;">合同基本信息</div>`);
  p(`<table style="margin-bottom:20px;">`);
  p(`<thead><tr><th style="${PTH}">合同编号</th><th style="${PTH}">承租方</th><th style="${PTH}">租赁地址</th></tr></thead>`);
  p(`<tbody>`);
  for (const c of s.contracts) {
    p(`<tr><td style="${PTD}">${esc(c.contractNo)}</td><td style="${PTD}">${esc(c.tenant)}</td><td style="${PTD}">${esc(c.leaseAddress)}</td></tr>`);
  }
  p(`</tbody></table>`);

  p(`<div style="text-align:center;font-size:14px;font-weight:700;margin-bottom:6px;">租金物业费账单明细</div>`);
  p(`<table>`);
  p(`<thead><tr>`);
  p(`<th style="${PTH}width:120px">合同编号</th>`);
  p(`<th style="${PTH}width:70px;white-space:nowrap">收费项目</th>`);
  p(`<th style="${PTH}width:130px">计费起止日期</th>`);
  p(`<th style="${PTH}width:90px;text-align:right">应缴金额</th>`);
  p(`<th style="${PTH}width:90px;text-align:right">已缴金额</th>`);
  p(`<th style="${PTH}width:90px;text-align:right">未缴金额</th>`);
  p(`<th style="${PTH}width:110px;text-align:right;white-space:nowrap">缴纳期限</th>`);
  p(`</tr></thead>`);
  p(`<tbody>`);
  for (const r of s.ledgerRows) {
    p(`<tr><td style="${PTD}">${esc(r.contractNo)}</td><td style="${PTD}white-space:nowrap">${esc(r.feeType)}</td><td style="${PTD}">${esc(r.dateRange)}</td><td style="${PTD_R}">${esc(r.dueAmount)}</td><td style="${PTD_R}">${esc(r.paidAmount)}</td><td style="${PTD_R}">${esc(r.unpaidAmount)}</td><td style="${PTD_R}white-space:nowrap">${esc(r.dueDate)}</td></tr>`);
  }
  p(`<tr style="font-weight:700;background:#f5f5f5"><td colspan="3" style="${PTD}text-align:center">小计</td><td style="${PTD_R}">${esc(s.ledgerSubtotal.due)}</td><td style="${PTD_R}">${esc(s.ledgerSubtotal.paid)}</td><td style="${PTD_R}">${esc(s.ledgerSubtotal.unpaid)}</td><td style="${PTD}"></td></tr>`);
  p(`</tbody></table>`);

  if (s.utilityRows.length > 0 && s.utilitySubtotal) {
    p(`<div style="text-align:center;font-size:14px;font-weight:700;margin:16px 0 6px;">水电费账单明细</div>`);
    p(`<table>`);
    p(`<thead><tr>`);
    p(`<th style="${PTH}width:70px">收费项目</th>`);
    p(`<th style="${PTH}width:68px;white-space:nowrap">所属期</th>`);
    p(`<th style="${PTH}width:70px;text-align:center">使用量<br>（度或吨）</th>`);
    p(`<th style="${PTH}width:80px;text-align:right">单价(元)</th>`);
    p(`<th style="${PTH}width:90px;text-align:right">应缴金额</th>`);
    p(`<th style="${PTH}width:90px;text-align:right">已缴金额</th>`);
    p(`<th style="${PTH}width:90px;text-align:right">未缴金额</th>`);
    p(`</tr></thead>`);
    p(`<tbody>`);
    for (const r of s.utilityRows) {
      p(`<tr><td style="${PTD}">${esc(r.feeType)}</td><td style="${PTD}white-space:nowrap">${esc(r.period)}</td><td style="${PTD_R}">${esc(r.usage)}</td><td style="${PTD_R}">${esc(r.unitPrice)}</td><td style="${PTD_R}">${esc(r.dueAmount)}</td><td style="${PTD_R}">${esc(r.paidAmount)}</td><td style="${PTD_R}">${esc(r.unpaidAmount)}</td></tr>`);
    }
    p(`<tr style="font-weight:700;background:#f5f5f5"><td colspan="3" style="${PTD}text-align:center">小计</td><td style="${PTD}"></td><td style="${PTD_R}">${esc(s.utilitySubtotal.due)}</td><td style="${PTD_R}">${esc(s.utilitySubtotal.paid)}</td><td style="${PTD_R}">${esc(s.utilitySubtotal.unpaid)}</td></tr>`);
    p(`</tbody></table>`);
  }

  p(`<table style="margin-top:8px;">`);
  p(`<tbody><tr style="font-weight:700;background:#f5f5f5">`);
  p(`<td style="${PTD}text-align:right;white-space:nowrap">应缴金额合计</td>`);
  p(`<td style="${PTD_R}width:90px">${esc(s.grandTotal.due)}</td>`);
  p(`<td style="${PTD}text-align:right;white-space:nowrap">已缴金额合计</td>`);
  p(`<td style="${PTD_R}width:90px">${esc(s.grandTotal.paid)}</td>`);
  p(`<td style="${PTD}text-align:right;white-space:nowrap">未缴金额合计</td>`);
  p(`<td style="${PTD_R}width:90px">${esc(s.grandTotal.unpaid)}</td>`);
  p(`</tr></tbody></table>`);

  p(`<div style="margin-top:16px;font-size:13px;line-height:1.8;">`);
  p(`<p>说明: 租金及物业费: 请贵司在最后缴纳期限前缴齐, 水电费: 请在收到账单起的5个工作日内缴齐。</p>`);
  p(`<p>谢谢贵司的支持与配合!</p>`);
  p(`</div>`);

  const bankLines: string[] = [];
  if (s.creditCode) bankLines.push(`统一社会信用代码: ${s.creditCode}`);
  if (s.bankAccountName) bankLines.push(`户名: ${s.bankAccountName}`);
  if (s.bankAccountNo) bankLines.push(`银行账号: ${s.bankAccountNo}`);
  if (s.bankName) bankLines.push(`开户行: ${s.bankName}`);
  if (bankLines.length > 0) {
    p(`<div style="margin-top:12px;font-size:13px;line-height:1.8;">`);
    for (const line of bankLines) p(`<p>${esc(line)}</p>`);
    p(`</div>`);
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  p(`<div style="margin-top:30px;text-align:right;font-size:13px;line-height:2;">`);
  p(`<p>${esc(ORG_SIGNATURE)}</p>`);
  p(`<p>${dateStr}</p>`);
  p(`</div>`);

  return parts.join('');
}

const PRINT_STYLE = `
@page { size: A4; margin: 15mm; }
body { font-family: system-ui,-apple-system,'Noto Sans SC','Microsoft YaHei',sans-serif; color: #1a1a2e; line-height: 1.6; margin: 0; padding: 0; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tbody { display: table-row-group; }
tr { page-break-inside: avoid; }
@media print { .no-print { display: none !important; } }
`;

function wrapPrintHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${PRINT_STYLE}</style></head><body>${body}</body></html>`;
}

export function renderPrintHtml(s: IPdfTenantStatement): string {
  return wrapPrintHtml(`${s.companyName}-缴费通知单`, renderPrintBody(s));
}

export function printStatement(statement: IPdfTenantStatement): void {
  const html = renderPrintHtml(statement);
  const newWin = window.open('', '_blank');
  if (!newWin) {
    return;
  }
  newWin.document.write(html);
  newWin.document.close();
  newWin.onload = () => {
    newWin.print();
  };
}

export function printStatements(statements: IPdfTenantStatement[]): void {
  if (statements.length === 0) return;

  if (statements.length === 1) {
    printStatement(statements[0]);
    return;
  }

  const bodyParts = statements.map((s: IPdfTenantStatement) =>
    `<div class="tenant-block" style="page-break-after:always;">${renderPrintBody(s)}</div>`
  );
  bodyParts[bodyParts.length - 1] = `<div style="page-break-after:auto;">${renderPrintBody(statements[statements.length - 1])}</div>`;

  const style = PRINT_STYLE + `.tenant-block { page-break-after: always; }\n.tenant-block:last-child { page-break-after: auto; }`;
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>对账单打印</title><style>${style}</style></head><body>${bodyParts.join('')}</body></html>`;
  const newWin = window.open('', '_blank');
  if (!newWin) return;
  newWin.document.write(html);
  newWin.document.close();
  newWin.onload = () => {
    newWin.print();
  };
}

