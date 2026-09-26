import { normalizeMojibake } from './text-encoding.util';

export function nombreOriginalArchivo(nombre: string): string {
  return normalizeMojibake(nombre);
}

export function nombreGuardadoArchivo(
  fecha: Date,
  numeroSolicitud: string | number,
  nombreOriginal: string,
): string {
  const fechaTexto = fecha.toLocaleDateString('en-CA').replace(/-/g, '');
  const horaTexto = fecha.toTimeString().slice(0, 8).replace(/:/g, '');
  const nombreLimpio = nombreOriginal
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');

  return `${fechaTexto}_${horaTexto}_${numeroSolicitud}_${nombreLimpio}`;
}
