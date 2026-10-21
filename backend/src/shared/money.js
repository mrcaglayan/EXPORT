import Decimal from 'decimal.js';
import { AppError } from './AppError.js';

const Money = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
const invalid = () => new AppError(422, 'INVALID_AMOUNT', 'Amounts must be decimal strings with up to 14 integer and 6 fractional digits.');
export function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(value)) throw invalid();
  return new Money(value).toFixed(6);
}
export function sumAmounts(values) {
  const total = values.reduce((sum, value) => sum.plus(amount(value)), new Money(0));
  return amount(total.toFixed(6));
}
export function multiplyAmounts(quantity, unitPrice) {
  return amount(new Money(amount(quantity)).times(amount(unitPrice)).toFixed(6));
}
export function sameAmount(left, right) { return amount(left) === amount(right); }
