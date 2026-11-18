import type { DateRange } from '@/types';
import { getLocalTimeZone, parseDate } from '@internationalized/date';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Parses the `start~end` form used in the URL; anything malformed means no range. */
export function parseDateRange(value: string): DateRange | undefined {
  const [start = '', end = '', ...rest] = value.split('~');
  if (rest.length || !isDate(start) || !isDate(end) || start > end) return undefined;
  return { start, end };
}

export function stringifyDateRange(range?: DateRange): string {
  return range ? `${range.start}~${range.end}` : '';
}

export function formatDateRange(range: DateRange): string {
  return range.start === range.end ? range.start : `${range.start} ~ ${range.end}`;
}

/** Converts local dates to instants: from the start day's midnight to the day after the end. */
export function dateRangeBounds(range: DateRange): {
  createdAfter: string;
  createdBefore: string;
} {
  const zone = getLocalTimeZone();
  return {
    createdAfter: parseDate(range.start).toDate(zone).toISOString(),
    createdBefore: parseDate(range.end).add({ days: 1 }).toDate(zone).toISOString(),
  };
}
