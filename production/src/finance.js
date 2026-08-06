export async function totals(env) {
  const one = async (sql, ...args) => Number((await env.DB.prepare(sql).bind(...args).first())?.v || 0);
  const income = await one("SELECT COALESCE(SUM(amount_piastres),0) v FROM ledger_entries WHERE account='income'");
  const deposits = await one("SELECT COALESCE(SUM(amount_piastres),0) v FROM ledger_entries WHERE fund='deposit'");
  const expense = await one("SELECT COALESCE(SUM(amount_piastres),0) v FROM expenses WHERE status='approved'");
  const pending = await one("SELECT COALESCE(SUM(amount_piastres),0) v FROM payments WHERE status IN('submitted','in_review','needs_info')");
  const dues = await one('SELECT COALESCE(SUM(annual_due_piastres),0) v FROM units');
  return { income, deposits, expensesTotal: expense, pending, available: Math.max(0, income - expense), arrears: Math.max(0, dues - income) };
}
