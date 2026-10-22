// Public diagnostic observations are not detector verdicts or a customer-route
// certificate. A reached page, missing data, and a reported warning differ.
export function classifyPublicPage({status, origin, title = '', text = ''}) {
  if (!Number.isInteger(status)) return 'unavailable';
  if (origin && origin !== 'https://ip.net.coffee') return 'unexpected-origin';
  if (status < 200 || status >= 400) return 'http-error';
  if (/just a moment|checking your browser|verify you are human|attention required|access denied/i.test(title + '\n' + text)) return 'site-challenge';
  return 'observed';
}

export function classifyPublicCell(text) {
  if (typeof text !== 'string' || !text.trim() || /检测中|查询中|加载中|获取失败|检测失败|超时|无数据|未知|未暴露|未获取/i.test(text)) return 'unknown';
  // "未检测到泄露" and "已禁用或无泄露" must remain different observations.
  if (/已禁用|无候选|无法检测|不支持/i.test(text)) return 'blocked-or-unsupported';
  if (/不一致|存在泄露|检测到泄露|受限|异常|高危/i.test(text) && !/未检测到泄露/i.test(text)) return 'warning';
  return 'reported';
}
