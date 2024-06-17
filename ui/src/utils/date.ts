import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export function formatDatetime(date: string | Date | undefined | null, tz?: string): string {
  if (!date) {
    return '';
  }
  return dayjs(date).tz(tz).format('YYYY-MM-DD HH:mm');
}

/**
 * Get relative time to end date
 *
 * @param date end date
 * @returns relative time to end date
 *
 * @example
 *
 * // now is 2020-12-01
 * RelativeTimeTo("2021-01-01") // in 1 month
 */
export function relativeTimeTo(date: string | Date | undefined | null) {
  if (!date) {
    return;
  }

  const currentDate = new Date();
  const inputDate = new Date(date);

  const oneYearInMilliseconds = 365 * 24 * 60 * 60 * 1000;

  if (currentDate.getTime() - inputDate.getTime() > oneYearInMilliseconds) {
    return formatDatetime(date);
  }

  return dayjs().to(dayjs(date));
}
