import type {
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingEnrollment,
} from './api';

export const campaignStatusMeta: Record<
  GroupMatchingCampaign['status'],
  { label: string; color: string }
> = {
  draft: { label: '草稿', color: 'default' },
  recruiting: { label: '招募中', color: 'processing' },
  ready: { label: '可成班', color: 'success' },
  formed: { label: '已成班', color: 'purple' },
  cancelled: { label: '已取消', color: 'default' },
};

export const enrollmentStatusMeta: Record<
  GroupMatchingEnrollment['status'],
  { label: string; color: string }
> = {
  pending_deposit: { label: '待收意向金', color: 'gold' },
  deposit_paid: { label: '意向金已付', color: 'green' },
  selected: { label: '已入选', color: 'blue' },
  waitlisted: { label: '候补', color: 'default' },
  withdrawn: { label: '已退出', color: 'default' },
};

export const depositPaymentMethodOptions = [
  { value: 'cash', label: '现金' },
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'wechat_transfer', label: '微信转账' },
  { value: 'other', label: '其他方式' },
];

export function money(amountMinor: number) {
  return `¥${(amountMinor / 100).toFixed(2)}`;
}

export function toMinor(value: number) {
  return Math.round(value * 100);
}

export function nullable(value?: string) {
  const text = value?.trim();
  return text || null;
}

export function toIso(value?: string) {
  return value ? new Date(value).toISOString() : null;
}

export function localDateTimeValue(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试';
}

export function paidEnrollments(detail?: GroupMatchingCampaignDetail) {
  return (detail?.enrollments.items ?? []).filter(
    (item) => item.status === 'deposit_paid' || item.status === 'selected',
  );
}
