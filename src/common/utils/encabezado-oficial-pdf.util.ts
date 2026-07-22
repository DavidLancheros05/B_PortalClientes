// Encabezado "formato oficial" (tabla con logo, razón social, código de
// FORMATO, PAGINA No. y REVISION), dibujado con pdf-lib. Réplica del
// encabezado que ya usa el frontend para las plantillas de documento tipo
// TEXTO (ver F_PortalClientes/src/lib/carta-pdf.util.ts::dibujarEncabezadoOficialPdf)
// para que el PDF completo de la solicitud (generarPdfSolicitud, tipo de
// documento F-P3-06) tenga la misma cabecera oficial en todas sus páginas.
import { PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export const ENCABEZADO_ANCHO_LOGO = 70;
export const ENCABEZADO_ANCHO_FORMATO = 95;
export const ENCABEZADO_ANCHO_PAGINA = 95;
export const ENCABEZADO_ANCHO_REVISION = 95;
export const ENCABEZADO_ROW1_HEIGHT = 55;
export const ENCABEZADO_ROW2_HEIGHT = 26;
export const ENCABEZADO_ALTURA =
  ENCABEZADO_ROW1_HEIGHT + ENCABEZADO_ROW2_HEIGHT;

export function leerLogoBytes(): Buffer {
  return fs.readFileSync(path.join(process.cwd(), 'public', 'logo.jpg'));
}

export interface EncabezadoOficialConfig {
  marginLeft: number;
  contentWidth: number;
  headerTopY: number;
  logoImage: PDFImage;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  razonSocial: string;
  tituloDocumento: string;
  formatoCodigo: string;
  formatoCodigoSecundario?: string | null;
  revision?: string | null;
}

function dibujarCentrado(
  page: PDFPage,
  texto: string,
  cellX: number,
  cellWidth: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(texto, size);
  page.drawText(texto, {
    x: cellX + (cellWidth - width) / 2,
    y,
    size,
    font,
    color,
  });
}

// Recorta con elipsis si el texto no entra en maxWidth — el título del
// documento (tdo_nombre) puede ser bastante más largo que el usado hasta
// ahora en las plantillas de texto (ej. F-P3-06 vs "Manifestación suscrita"),
// y sin este recorte se monta encima de la celda de REVISION.
function truncarAncho(
  font: PDFFont,
  texto: string,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(texto, size) <= maxWidth) return texto;
  const elipsis = '…';
  let recortado = texto;
  while (
    recortado.length > 0 &&
    font.widthOfTextAtSize(recortado + elipsis, size) > maxWidth
  ) {
    recortado = recortado.slice(0, -1).trimEnd();
  }
  return recortado + elipsis;
}

function dibujarBloqueCentrado(
  page: PDFPage,
  lineas: { texto: string; size: number; font: PDFFont }[],
  cellX: number,
  cellWidth: number,
  cellTopY: number,
  cellHeight: number,
  color: ReturnType<typeof rgb>,
) {
  const lineHeight = 10;
  const bloqueAlto = lineas.length * lineHeight;
  let y = cellTopY - cellHeight / 2 + bloqueAlto / 2 - lineHeight * 0.8;
  for (const linea of lineas) {
    dibujarCentrado(
      page,
      linea.texto,
      cellX,
      cellWidth,
      y,
      linea.size,
      linea.font,
      color,
    );
    y -= lineHeight;
  }
}

export function dibujarEncabezadoOficialPdf(
  page: PDFPage,
  config: EncabezadoOficialConfig,
  numeroPagina: number,
  totalPaginas: number,
) {
  const {
    marginLeft,
    contentWidth,
    headerTopY,
    logoImage,
    fontRegular,
    fontBold,
    razonSocial,
    tituloDocumento,
    formatoCodigo,
    formatoCodigoSecundario,
    revision,
  } = config;
  const negro = rgb(0.1, 0.1, 0.1);

  const anchoRazonSocial =
    contentWidth -
    ENCABEZADO_ANCHO_LOGO -
    ENCABEZADO_ANCHO_FORMATO -
    ENCABEZADO_ANCHO_PAGINA;
  const anchoTitulo = contentWidth - ENCABEZADO_ANCHO_REVISION;
  const xRazonSocial = marginLeft + ENCABEZADO_ANCHO_LOGO;
  const xFormato = xRazonSocial + anchoRazonSocial;
  const xPagina = xFormato + ENCABEZADO_ANCHO_FORMATO;
  const xRevision = marginLeft + anchoTitulo;

  page.drawRectangle({
    x: marginLeft,
    y: headerTopY - ENCABEZADO_ALTURA,
    width: contentWidth,
    height: ENCABEZADO_ALTURA,
    borderColor: negro,
    borderWidth: 1,
  });

  page.drawLine({
    start: { x: marginLeft, y: headerTopY - ENCABEZADO_ROW1_HEIGHT },
    end: {
      x: marginLeft + contentWidth,
      y: headerTopY - ENCABEZADO_ROW1_HEIGHT,
    },
    thickness: 1,
    color: negro,
  });
  [xRazonSocial, xFormato, xPagina].forEach((x) => {
    page.drawLine({
      start: { x, y: headerTopY },
      end: { x, y: headerTopY - ENCABEZADO_ROW1_HEIGHT },
      thickness: 1,
      color: negro,
    });
  });
  page.drawLine({
    start: { x: xRevision, y: headerTopY - ENCABEZADO_ROW1_HEIGHT },
    end: { x: xRevision, y: headerTopY - ENCABEZADO_ALTURA },
    thickness: 1,
    color: negro,
  });

  const logoSize = 45;
  page.drawImage(logoImage, {
    x: marginLeft + (ENCABEZADO_ANCHO_LOGO - logoSize) / 2,
    y:
      headerTopY -
      ENCABEZADO_ROW1_HEIGHT +
      (ENCABEZADO_ROW1_HEIGHT - logoSize) / 2,
    width: logoSize,
    height: logoSize,
  });

  dibujarCentrado(
    page,
    razonSocial,
    xRazonSocial,
    anchoRazonSocial,
    headerTopY - ENCABEZADO_ROW1_HEIGHT / 2 - 4,
    11,
    fontBold,
    negro,
  );

  dibujarBloqueCentrado(
    page,
    [
      { texto: 'FORMATO', size: 7, font: fontBold },
      { texto: formatoCodigo, size: 8, font: fontRegular },
      ...(formatoCodigoSecundario
        ? [{ texto: formatoCodigoSecundario, size: 8, font: fontRegular }]
        : []),
    ],
    xFormato,
    ENCABEZADO_ANCHO_FORMATO,
    headerTopY,
    ENCABEZADO_ROW1_HEIGHT,
    negro,
  );

  dibujarBloqueCentrado(
    page,
    [
      { texto: 'PAGINA No.', size: 7, font: fontBold },
      { texto: `${numeroPagina} de ${totalPaginas}`, size: 8, font: fontRegular },
    ],
    xPagina,
    ENCABEZADO_ANCHO_PAGINA,
    headerTopY,
    ENCABEZADO_ROW1_HEIGHT,
    negro,
  );

  const tituloTruncado = truncarAncho(
    fontBold,
    tituloDocumento,
    10,
    anchoTitulo - 16,
  );
  page.drawText(tituloTruncado, {
    x: marginLeft + 8,
    y: headerTopY - ENCABEZADO_ROW1_HEIGHT - ENCABEZADO_ROW2_HEIGHT / 2 - 3,
    size: 10,
    font: fontBold,
    color: negro,
  });

  dibujarCentrado(
    page,
    `REVISION ${revision || '-'}`,
    xRevision,
    ENCABEZADO_ANCHO_REVISION,
    headerTopY - ENCABEZADO_ROW1_HEIGHT - ENCABEZADO_ROW2_HEIGHT / 2 - 3,
    9,
    fontBold,
    negro,
  );
}

// ===== Tabla "CONTROL DE CAMBIOS" (Revisión / Descripción del Cambio /
// Fecha) — réplica de dibujarTablaRevisionesPdf en
// F_PortalClientes/src/lib/carta-pdf.util.ts, para que generarPdfSolicitud
// (backend, documento F-P3-06) dibuje la misma tabla al final del cuerpo. =====

export interface CursorSimplePdf {
  page: PDFPage;
  y: number;
}

export interface RevisionDocumentoPdf {
  revision: string;
  descripcionCambio: string;
  fecha: string;
}

// WinAnsi (cp1252, la codificación que usan las fuentes estándar de
// pdf-lib) no puede representar cualquier code point Unicode — un
// caracter corrupto (mojibake de un insert mal codificado, un emoji, etc.)
// en un campo libre como "Descripción del Cambio" hacía que
// page.drawText() reventara y tumbara la generación del PDF COMPLETO de
// la solicitud para todo el mundo, no solo esa fila. Se reemplaza
// cualquier code point fuera del rango seguro (ASCII imprimible + acentos/
// ñ/¿/¡ en español) por "?" antes de dibujar.
function sanearTextoPdf(texto: string): string {
  return texto.replace(/[^\x20-\x7E¡¿À-ÿ]/g, '?');
}

function envolverTextoPlano(
  texto: string,
  maxWidth: number,
  fontSize: number,
  font: PDFFont,
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (actual && font.widthOfTextAtSize(tentativa, fontSize) > maxWidth) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = tentativa;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

export function dibujarTablaRevisionesPdf(
  cursor: CursorSimplePdf,
  opciones: {
    marginLeft: number;
    contentWidth: number;
    fontRegular: PDFFont;
    fontBold: PDFFont;
    checkSpace: (cursor: CursorSimplePdf, needed: number) => void;
  },
  revisiones: RevisionDocumentoPdf[],
): void {
  if (revisiones.length === 0) return;
  const { marginLeft, contentWidth, fontRegular, fontBold, checkSpace } =
    opciones;
  const negro = rgb(0.1, 0.1, 0.1);
  const fontSize = 8;
  const padX = 6;
  const padY = 5;
  const lineHeight = 10;

  const colRevisionW = 70;
  const colFechaW = 100;
  const colDescW = contentWidth - colRevisionW - colFechaW;

  checkSpace(cursor, 24);
  cursor.y -= 10;
  cursor.page.drawText('CONTROL DE CAMBIOS', {
    x: marginLeft,
    y: cursor.y,
    size: 9,
    font: fontBold,
    color: negro,
  });
  cursor.y -= 14;

  const dibujarFila = (
    celdasOriginales: [string, string, string],
    font: PDFFont,
    alturaMin: number,
  ) => {
    const celdas: [string, string, string] = [
      sanearTextoPdf(celdasOriginales[0]),
      sanearTextoPdf(celdasOriginales[1]),
      sanearTextoPdf(celdasOriginales[2]),
    ];
    const lineasDesc = envolverTextoPlano(
      celdas[1],
      colDescW - padX * 2,
      fontSize,
      font,
    );
    const altoFila = Math.max(alturaMin, lineasDesc.length * lineHeight + padY * 2);
    checkSpace(cursor, altoFila);

    const xRevision = marginLeft;
    const xDesc = marginLeft + colRevisionW;
    const xFecha = xDesc + colDescW;
    const filaTopY = cursor.y;

    cursor.page.drawRectangle({
      x: marginLeft,
      y: filaTopY - altoFila,
      width: contentWidth,
      height: altoFila,
      borderColor: negro,
      borderWidth: 1,
    });
    cursor.page.drawLine({
      start: { x: xDesc, y: filaTopY },
      end: { x: xDesc, y: filaTopY - altoFila },
      thickness: 1,
      color: negro,
    });
    cursor.page.drawLine({
      start: { x: xFecha, y: filaTopY },
      end: { x: xFecha, y: filaTopY - altoFila },
      thickness: 1,
      color: negro,
    });

    dibujarCentrado(
      cursor.page,
      celdas[0],
      xRevision,
      colRevisionW,
      filaTopY - altoFila / 2 - 3,
      fontSize,
      font,
      negro,
    );
    lineasDesc.forEach((linea, idx) => {
      cursor.page.drawText(linea, {
        x: xDesc + padX,
        y: filaTopY - padY - (idx + 1) * lineHeight + 2,
        size: fontSize,
        font,
        color: negro,
      });
    });
    dibujarCentrado(
      cursor.page,
      celdas[2],
      xFecha,
      colFechaW,
      filaTopY - altoFila / 2 - 3,
      fontSize,
      font,
      negro,
    );

    cursor.y -= altoFila;
  };

  dibujarFila(['Revisión', 'Descripción del Cambio', 'Fecha'], fontBold, 18);
  for (const rev of revisiones) {
    dibujarFila(
      [rev.revision || '-', rev.descripcionCambio, rev.fecha],
      fontRegular,
      16,
    );
  }
}
