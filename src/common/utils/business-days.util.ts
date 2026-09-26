// Todas las fechas se tratan en hora local del proceso, que es Colombia
// (process.env.TZ en main.ts). El driver (useUTC: false) lee las columnas
// `date` como medianoche local, así que el día calendario sale de los
// getters locales. Así "hoy" es el día de Colombia también después de las
// 7 p. m., cuando en UTC ya es mañana. Ver
// documentacion/Portal Clientes/contexto general/manejo-fechas-zona-horaria.md.
function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeToDate(value: string | Date): Date {
  if (typeof value === 'string') {
    // 'YYYY-MM-DD' con new Date() se interpreta como medianoche UTC (el día
    // anterior en Colombia): se arma a mano en hora local.
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function buildHolidaySet(holidays: Array<string | Date>): Set<string> {
  const holidayKeys = new Set<string>();

  for (const holiday of holidays) {
    const normalized = normalizeToDate(holiday);
    if (!Number.isNaN(normalized.getTime())) {
      holidayKeys.add(toDateKey(normalized));
    }
  }

  return holidayKeys;
}

// 0=domingo, 1=lunes, ..., 6=sábado (misma convención que Date.getDay()).
// Sin default: los días no hábiles salen siempre de
// param_dias_no_habiles_semana (ver HistorialWorkflowService
// .cargarCalendarioHabil) — si llegan vacíos es un error de configuración,
// no se asume sábado/domingo.
export function buildNonBusinessWeekdaySet(
  weekdays: Array<number> | Set<number>,
): Set<number> {
  const set = weekdays instanceof Set ? weekdays : new Set(weekdays);
  if (set.size === 0) {
    throw new Error(
      'No hay días no hábiles de la semana configurados (param_dias_no_habiles_semana).',
    );
  }
  return set;
}

export function isBusinessDay(
  date: Date,
  holidayKeys: Set<string>,
  nonBusinessWeekdays: Set<number>,
): boolean {
  if (nonBusinessWeekdays.has(date.getDay())) {
    return false;
  }

  return !holidayKeys.has(toDateKey(date));
}

// Suma días hábiles, saltando los días de la semana no hábiles y los
// festivos configurados en BD.
export function addBusinessDays(
  startDate: Date,
  days: number,
  holidays: Array<string | Date>,
  nonBusinessWeekdays: Array<number> | Set<number>,
): Date {
  const result = new Date(startDate.getTime());
  const holidayKeys = buildHolidaySet(holidays);
  const weekdaySet = buildNonBusinessWeekdaySet(nonBusinessWeekdays);

  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, holidayKeys, weekdaySet)) {
      added++;
    }
  }

  return result;
}
