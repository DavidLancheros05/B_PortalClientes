function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeToDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const parsed = new Date(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function buildHolidaySet(
  holidays: Array<string | Date> = [],
): Set<string> {
  const holidayKeys = new Set<string>();

  for (const holiday of holidays) {
    const normalized = normalizeToDate(holiday);
    if (!Number.isNaN(normalized.getTime())) {
      holidayKeys.add(toDateKey(normalized));
    }
  }

  return holidayKeys;
}

export function isBusinessDay(date: Date, holidayKeys?: Set<string>): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  if (!holidayKeys || holidayKeys.size === 0) {
    return true;
  }

  return !holidayKeys.has(toDateKey(date));
}

// Suma días hábiles, saltando fines de semana y festivos opcionales
export function addBusinessDays(
  startDate: Date,
  days: number,
  holidays: Array<string | Date> = [],
): Date {
  const result = new Date(startDate);
  const holidayKeys = buildHolidaySet(holidays);

  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, holidayKeys)) {
      added++;
    }
  }

  return result;
}
