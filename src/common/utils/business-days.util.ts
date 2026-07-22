// Todas las fechas se tratan como calendario "puro" en UTC (getUTC*/setUTC*),
// no en hora local del proceso. Las columnas SQL Server `date` (sin hora ni
// zona horaria) se serializan/deserializan como medianoche UTC — usar
// getters locales aquí desfasaría un día el resultado en cualquier proceso
// cuya zona horaria del sistema no sea UTC (ej. un dev corriendo en
// America/Bogota, UTC-5).
function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeToDate(value: string | Date): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    ),
  );
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

// 0=domingo, 1=lunes, ..., 6=sábado (misma convención que Date.getUTCDay()).
// Default preserva el comportamiento histórico (sábado y domingo).
const DEFAULT_NON_BUSINESS_WEEKDAYS = new Set([0, 6]);

export function buildNonBusinessWeekdaySet(
  weekdays?: Array<number> | Set<number> | null,
): Set<number> {
  if (!weekdays) return DEFAULT_NON_BUSINESS_WEEKDAYS;
  const set = weekdays instanceof Set ? weekdays : new Set(weekdays);
  return set.size > 0 ? set : DEFAULT_NON_BUSINESS_WEEKDAYS;
}

export function isBusinessDay(
  date: Date,
  holidayKeys?: Set<string>,
  nonBusinessWeekdays: Set<number> = DEFAULT_NON_BUSINESS_WEEKDAYS,
): boolean {
  if (nonBusinessWeekdays.has(date.getUTCDay())) {
    return false;
  }

  if (!holidayKeys || holidayKeys.size === 0) {
    return true;
  }

  return !holidayKeys.has(toDateKey(date));
}

// Suma días hábiles, saltando los días de la semana configurados como no
// hábiles (sábado/domingo por defecto) y festivos opcionales.
export function addBusinessDays(
  startDate: Date,
  days: number,
  holidays: Array<string | Date> = [],
  nonBusinessWeekdays?: Array<number> | Set<number> | null,
): Date {
  const result = new Date(startDate.getTime());
  const holidayKeys = buildHolidaySet(holidays);
  const weekdaySet = buildNonBusinessWeekdaySet(nonBusinessWeekdays);

  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isBusinessDay(result, holidayKeys, weekdaySet)) {
      added++;
    }
  }

  return result;
}
