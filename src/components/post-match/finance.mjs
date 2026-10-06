import { t } from '../../core/i18n.mjs';
import { money } from '../pre-match/shared.mjs';

/** The same domain accounting is displayed in the finance step and final report. */
export function renderPostAccounting(preview) {
  const income = preview.income, account = preview.accounting;
  if (!account || !income) return '';
  const rows = [['post.openingTreasury', account.opening],
    ...(income.technicalIncome ? [['post.technicalIncome', income.technicalIncome]] : []),
    ['post.attendanceIncome', income.attendanceIncome], ['post.touchdownIncome', income.touchdownsIncome],
    ['post.nonStallingIncome', income.nonStallingIncome], ['post.paintingIncome', income.paintingIncome],
    ['post.winnings', account.winnings], ['post.saleIncome', account.sales], ['post.purchaseExpenses', account.purchases],
    ['post.safeDeposit', account.deposit], ['post.moneyLost', account.loss], ['post.closingTreasury', account.closing],
    ['post.safe', account.safeClosing]];
  return `<section class="post-accounting"><h3>${t('post.cashflowHeading')}</h3>
    <dl class="post-accounting-grid">${rows.map(([key, value]) => `<dt>${t(key)}</dt><dd data-post-account-value="${key}">${money(value)}</dd>`).join('')}</dl>
    <p class="pre-intro" data-post-account-pending ${preview.finance.pending ? '' : 'hidden'}>${t('post.financePending')}</p></section>`;
}
