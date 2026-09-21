// Motor de dibujo del cuerpo de una "carta formal" (encabezado + fecha +
// destinatario + asunto + cuerpo con subtítulo/párrafo/lista/viñeta,
// soportando **negrita** y {{size:N}}...{{/size}} puntuales) con pdf-lib.
// Réplica exacta, función por función, de
// F_PortalClientes/src/lib/carta-pdf.util.ts::generarCartaPdf y sus
// helpers — mismo algoritmo de layout palabra por palabra (necesario
// porque, a diferencia de pdfkit, pdf-lib no hace wrap/justificado por sí
// solo). Se porta en vez de compartirse porque frontend y backend son dos
// repos sin paquete común; ver
// "Documentos Cartonera/documentacion/mejoras/unificacion-carta-vinculacion-tipos-documentos.md"
// para el contexto de por qué antes había tres generadores de esta carta
// (pdfkit acá, html2pdf en el frontend, y este mismo motor pdf-lib usado
// solo para las plantillas de "Tipos de documentos") y por qué se
// unificaron en este único motor pdf-lib para los dos usos reales: el
// correo que se envía al aprobar CC2, y la vista previa "Ver Carta PDF"
// del detalle de la solicitud.
//
// El encabezado "formato oficial" (tabla logo/FORMATO/PAGINA/REVISION) y
// la tabla "CONTROL DE CAMBIOS" NO se re-portan acá: ya existen en
// encabezado-oficial-pdf.util.ts (portados una vez para generarPdfSolicitud)
// y se reutilizan tal cual.
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import {
  EncabezadoOficialConfig,
  ENCABEZADO_ALTURA,
  CursorSimplePdf,
  RevisionDocumentoPdf,
  dibujarEncabezadoOficialPdf,
  dibujarTablaRevisionesPdf,
  leerLogoBytes,
} from './encabezado-oficial-pdf.util';

export type { RevisionDocumentoPdf };

// ===== Clasificación de texto plano en bloques (subtítulo/párrafo/lista/
// viñeta) — puerto textual de carta-pdf.util.ts (frontend), sin cambios de
// comportamiento. =====

function esBloqueVineta(lineas: string[]): boolean {
  if (lineas.length < 2) return false;
  const primera = lineas[0];
  return primera.length <= 60 && primera.endsWith(':');
}

function separarPrefijoDeMarcadores(linea: string): {
  prefijo: string;
  resto: string;
} {
  const match = linea.match(/^(?:\*\*|\{\{size:\d+\}\}|\{\{\/size\}\})*/);
  const prefijo = match ? match[0] : '';
  return { prefijo, resto: linea.slice(prefijo.length) };
}

function esLineaVinetaExplicita(linea: string): boolean {
  return separarPrefijoDeMarcadores(linea).resto.startsWith('• ');
}

type ParteTexto = (
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; lineas: string[] }
  | { tipo: 'vineta'; label: string; restoLineas: string[] }
) & {
  espacioExtra: number;
  sangrado: boolean;
};

function agruparBloquesConEspacio(
  contenido: string,
): { lineas: string[]; espacioExtra: number; sangrado: boolean }[] {
  const bloques: { lineas: string[]; espacioExtra: number; sangrado: boolean }[] =
    [];
  let lineasActuales: string[] = [];
  let espacioExtraActual = 0;
  let blancosConsecutivos = 0;
  let sangradoPendiente = false;

  const cerrarBloque = () => {
    if (lineasActuales.length === 0) return;
    bloques.push({
      lineas: lineasActuales,
      espacioExtra: espacioExtraActual,
      sangrado: sangradoPendiente,
    });
    lineasActuales = [];
  };

  for (const lineaRaw of contenido.split('\n')) {
    const linea = lineaRaw.trim();
    if (linea === '') {
      blancosConsecutivos++;
      continue;
    }
    if (blancosConsecutivos > 0) {
      cerrarBloque();
      espacioExtraActual = blancosConsecutivos - 1;
      sangradoPendiente = false;
    }
    blancosConsecutivos = 0;

    if (esLineaVinetaExplicita(linea)) {
      cerrarBloque();
      lineasActuales.push(linea);
      cerrarBloque();
      espacioExtraActual = 0;
      sangradoPendiente = true;
      continue;
    }

    lineasActuales.push(linea);
  }
  cerrarBloque();

  return bloques;
}

function balancearMarcadoresPorLinea(contenido: string): string {
  const pila: string[] = [];
  const textoDeCierre = (marcador: string) =>
    marcador === '**' ? '**' : '{{/size}}';

  const lineasFinal = contenido.split('\n').map((linea) => {
    const prefijo = pila.join('');

    const regexToken = /\*\*|\{\{size:\d+\}\}|\{\{\/size\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regexToken.exec(linea))) {
      if (match[0] === '**') {
        const i = pila.lastIndexOf('**');
        if (i !== -1) pila.splice(i, 1);
        else pila.push('**');
      } else if (match[0] === '{{/size}}') {
        const i = pila.findIndex((m) => m.startsWith('{{size:'));
        if (i !== -1) pila.splice(i, 1);
      } else {
        pila.push(match[0]);
      }
    }

    const sufijo = [...pila].reverse().map(textoDeCierre).join('');
    return prefijo + linea + sufijo;
  });

  return lineasFinal.join('\n');
}

function clasificarBloquesTexto(contenidoOriginal: string): ParteTexto[] {
  const contenido = balancearMarcadoresPorLinea(contenidoOriginal);
  const bloques = agruparBloquesConEspacio(contenido);

  const partes: ParteTexto[] = [];

  for (const { lineas, espacioExtra, sangrado } of bloques) {
    if (lineas.length === 1 && esLineaVinetaExplicita(lineas[0])) {
      const { prefijo, resto } = separarPrefijoDeMarcadores(lineas[0]);
      partes.push({
        tipo: 'vineta',
        label: '',
        restoLineas: [(prefijo + resto.slice(2)).trim()],
        espacioExtra,
        sangrado,
      });
      continue;
    }
    if (esBloqueVineta(lineas)) {
      const [primera, ...resto] = lineas;
      partes.push({
        tipo: 'vineta',
        label: primera,
        restoLineas: resto,
        espacioExtra,
        sangrado,
      });
      continue;
    }
    if (lineas.length === 1) {
      const esSubtitulo = lineas[0].length <= 60 && lineas[0].endsWith(':');
      if (esSubtitulo) {
        partes.push({ tipo: 'subtitulo', texto: lineas[0], espacioExtra, sangrado });
      } else {
        partes.push({ tipo: 'parrafo', texto: lineas[0], espacioExtra, sangrado });
      }
    } else {
      partes.push({ tipo: 'lista', lineas, espacioExtra, sangrado });
    }
  }

  return partes;
}

// ===== Primitivas de dibujo de texto con palabras mixtas negrita/regular
// — puerto textual de carta-pdf.util.ts (frontend). =====

interface PalabraPdf {
  texto: string;
  bold: boolean;
  size?: number;
  fontFamily?: string;
}

const FONT_MAP: Record<string, { regular: string; bold: string }> = {
  'Times New Roman': { regular: 'Times-Roman', bold: 'Times-Bold' },
  'Arial': { regular: 'Helvetica', bold: 'Helvetica-Bold' },
  'Courier New': { regular: 'Courier', bold: 'Courier-Bold' },
};

function resolverFuentePdf(
  palabra: PalabraPdf,
  fuentes: Map<string, { regular: PDFFont; bold: PDFFont }>,
): PDFFont | null {
  if (!palabra.fontFamily) return null;
  const entrada = FONT_MAP[palabra.fontFamily];
  if (!entrada) return null;
  const conjunto = fuentes.get(entrada.regular);
  if (!conjunto) return null;
  return palabra.bold ? conjunto.bold : conjunto.regular;
}

function envolverPalabrasPdf(
  palabras: PalabraPdf[],
  maxWidth: number,
  fontSize: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  fuentesExtra?: Map<string, { regular: PDFFont; bold: PDFFont }>,
): PalabraPdf[][] {
  const spaceWidth = fontRegular.widthOfTextAtSize(' ', fontSize);
  const lineas: PalabraPdf[][] = [];
  let lineaActual: PalabraPdf[] = [];
  let anchoActual = 0;

  for (const palabra of palabras) {
    const font = (fuentesExtra ? resolverFuentePdf(palabra, fuentesExtra) : null) ?? (palabra.bold ? fontBold : fontRegular);
    const anchoPalabra = font.widthOfTextAtSize(palabra.texto, palabra.size ?? fontSize);
    const anchoConEspacio =
      lineaActual.length > 0
        ? anchoActual + spaceWidth + anchoPalabra
        : anchoPalabra;
    if (lineaActual.length > 0 && anchoConEspacio > maxWidth) {
      lineas.push(lineaActual);
      lineaActual = [palabra];
      anchoActual = anchoPalabra;
    } else {
      lineaActual = [...lineaActual, palabra];
      anchoActual = anchoConEspacio;
    }
  }
  if (lineaActual.length > 0) lineas.push(lineaActual);
  return lineas;
}

function altoLineaPdf(
  lineaPalabras: PalabraPdf[],
  fontSizeBase: number,
  lineHeightBase: number,
): number {
  const tamañoMax = lineaPalabras.reduce(
    (max, p) => Math.max(max, p.size ?? fontSizeBase),
    fontSizeBase,
  );
  return Math.max(lineHeightBase, lineHeightBase * (tamañoMax / fontSizeBase));
}

function palabrasConNegritaPdf(texto: string, boldPorDefecto = false): PalabraPdf[] {
  const palabras: PalabraPdf[] = [];
  for (const parte of texto.split(/(\*\*[^*]+\*\*)/g)) {
    if (!parte) continue;
    const esNegrita = parte.startsWith('**') && parte.endsWith('**') && parte.length > 4;
    const contenido = esNegrita ? parte.slice(2, -2) : parte;
    for (const palabra of contenido.split(/\s+/).filter(Boolean)) {
      palabras.push({ texto: palabra, bold: esNegrita || boldPorDefecto });
    }
  }
  return palabras;
}

function palabrasConEstilosPdf(texto: string, boldPorDefecto = false): PalabraPdf[] {
  const palabras: PalabraPdf[] = [];
  const regexComb = /\{\{font:([^}]+)\}\}([\s\S]*?)\{\{\/font\}\}|\{\{size:(\d+)\}\}([\s\S]*?)\{\{\/size\}\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const agregarTramo = (fragmento: string, size?: number, fontFamily?: string) => {
    for (const palabra of palabrasConNegritaPdf(fragmento, boldPorDefecto)) {
      let p = palabra;
      if (size != null) p = { ...p, size };
      if (fontFamily != null) p = { ...p, fontFamily };
      palabras.push(p);
    }
  };

  while ((match = regexComb.exec(texto))) {
    if (match.index > cursor) agregarTramo(texto.slice(cursor, match.index));
    if (match[1] !== undefined) {
      agregarTramo(match[2], undefined, match[1]);
    } else {
      agregarTramo(match[4], Number(match[3]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < texto.length) agregarTramo(texto.slice(cursor));

  return palabras;
}

function dibujarLineaMixtaPdf(
  page: PDFPage,
  palabras: PalabraPdf[],
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  color: ReturnType<typeof rgb>,
  justificar: boolean,
  fuentesExtra?: Map<string, { regular: PDFFont; bold: PDFFont }>,
) {
  const spaceWidth = fontRegular.widthOfTextAtSize(' ', fontSize);

  const fontPara = (p: PalabraPdf) =>
    (fuentesExtra ? resolverFuentePdf(p, fuentesExtra) : null) ?? (p.bold ? fontBold : fontRegular);

  if (!justificar || palabras.length <= 1) {
    let cursorX = x;
    for (const palabra of palabras) {
      const font = fontPara(palabra);
      const size = palabra.size ?? fontSize;
      page.drawText(palabra.texto, { x: cursorX, y, size, font, color });
      cursorX += font.widthOfTextAtSize(palabra.texto, size) + spaceWidth;
    }
    return;
  }

  const anchoNatural =
    palabras.reduce(
      (suma, p) =>
        suma + fontPara(p).widthOfTextAtSize(p.texto, p.size ?? fontSize),
      0,
    ) +
    spaceWidth * (palabras.length - 1);
  const espacioExtra = Math.max(0, maxWidth - anchoNatural);
  const espacioPorHueco = espacioExtra / (palabras.length - 1);

  let cursorX = x;
  palabras.forEach((palabra) => {
    const font = fontPara(palabra);
    const size = palabra.size ?? fontSize;
    page.drawText(palabra.texto, { x: cursorX, y, size, font, color });
    cursorX +=
      font.widthOfTextAtSize(palabra.texto, size) + spaceWidth + espacioPorHueco;
  });
}

// ===== Dibujo de bloques con paginación automática — puerto textual. =====

interface CursorPdf {
  page: PDFPage;
  y: number;
}

interface EstiloCuerpoPdf {
  marginLeft: number;
  contentWidth: number;
  fontSizeBody: number;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  color: ReturnType<typeof rgb>;
  lineHeightParrafo: number;
  lineHeightLista: number;
  checkSpace: (cursor: CursorPdf, needed: number) => void;
  fuentesExtra?: Map<string, { regular: PDFFont; bold: PDFFont }>;
}

function dibujarParrafoPdf(cursor: CursorPdf, estilo: EstiloCuerpoPdf, texto: string) {
  const palabras = palabrasConEstilosPdf(texto);
  const lineas = envolverPalabrasPdf(
    palabras,
    estilo.contentWidth,
    estilo.fontSizeBody,
    estilo.fontRegular,
    estilo.fontBold,
    estilo.fuentesExtra,
  );
  lineas.forEach((lineaPalabras, idx) => {
    const alto = altoLineaPdf(lineaPalabras, estilo.fontSizeBody, estilo.lineHeightParrafo);
    estilo.checkSpace(cursor, alto);
    dibujarLineaMixtaPdf(
      cursor.page,
      lineaPalabras,
      estilo.marginLeft,
      cursor.y,
      estilo.contentWidth,
      estilo.fontSizeBody,
      estilo.fontRegular,
      estilo.fontBold,
      estilo.color,
      idx < lineas.length - 1,
      estilo.fuentesExtra,
    );
    cursor.y -= alto;
  });
  cursor.y -= 10;
}

function dibujarSubtituloPdf(cursor: CursorPdf, estilo: EstiloCuerpoPdf, texto: string) {
  estilo.checkSpace(cursor, estilo.fontSizeBody + 14);
  cursor.y -= 14;
  const textoLimpio = texto
    .replace(/\*\*/g, '')
    .replace(/\{\{size:\d+\}\}/g, '')
    .replace(/\{\{\/size\}\}/g, '')
    .replace(/\{\{font:[^}]+\}\}/g, '')
    .replace(/\{\{\/font\}\}/g, '');
  cursor.page.drawText(textoLimpio, {
    x: estilo.marginLeft,
    y: cursor.y,
    size: estilo.fontSizeBody,
    font: estilo.fontBold,
    color: estilo.color,
  });
  cursor.y -= estilo.fontSizeBody + 6;
}

function dibujarListaPdf(cursor: CursorPdf, estilo: EstiloCuerpoPdf, lineas: string[]) {
  for (const linea of lineas) {
    const palabras = palabrasConEstilosPdf(linea);
    const subLineas = envolverPalabrasPdf(
      palabras,
      estilo.contentWidth,
      estilo.fontSizeBody,
      estilo.fontRegular,
      estilo.fontBold,
      estilo.fuentesExtra,
    );
    subLineas.forEach((subLinea) => {
      const alto = altoLineaPdf(subLinea, estilo.fontSizeBody, estilo.lineHeightLista);
      estilo.checkSpace(cursor, alto);
      dibujarLineaMixtaPdf(
        cursor.page,
        subLinea,
        estilo.marginLeft,
        cursor.y,
        estilo.contentWidth,
        estilo.fontSizeBody,
        estilo.fontRegular,
        estilo.fontBold,
        estilo.color,
        false,
        estilo.fuentesExtra,
      );
      cursor.y -= alto;
    });
  }
  cursor.y -= 12;
}

const INDENT_SANGRIA = 14;

function dibujarVinetaPdf(
  cursor: CursorPdf,
  estilo: EstiloCuerpoPdf,
  label: string,
  restoLineas: string[],
) {
  const indent = INDENT_SANGRIA;
  const maxWidth = estilo.contentWidth - indent;

  const [primeraLinea, ...siguientesLineas] = restoLineas;
  const palabras: PalabraPdf[] = [
    ...palabrasConEstilosPdf(label, true),
    ...palabrasConEstilosPdf(primeraLinea ?? '', false),
  ];
  const lineas = envolverPalabrasPdf(
    palabras,
    maxWidth,
    estilo.fontSizeBody,
    estilo.fontRegular,
    estilo.fontBold,
    estilo.fuentesExtra,
  );
  const esUltimoRenglon = siguientesLineas.length === 0;
  lineas.forEach((lineaPalabras, idx) => {
    const alto = altoLineaPdf(lineaPalabras, estilo.fontSizeBody, estilo.lineHeightParrafo);
    estilo.checkSpace(cursor, alto);
    if (idx === 0) {
      cursor.page.drawText('•', {
        x: estilo.marginLeft,
        y: cursor.y,
        size: estilo.fontSizeBody,
        font: estilo.fontRegular,
        color: estilo.color,
      });
    }
    dibujarLineaMixtaPdf(
      cursor.page,
      lineaPalabras,
      estilo.marginLeft + indent,
      cursor.y,
      maxWidth,
      estilo.fontSizeBody,
      estilo.fontRegular,
      estilo.fontBold,
      estilo.color,
      idx < lineas.length - 1 || !esUltimoRenglon,
      estilo.fuentesExtra,
    );
    cursor.y -= alto;
  });

  // Cada línea SIGUIENTE que el autor escribió con Enter (sin línea en
  // blanco) se dibuja como su propio renglón — nunca se fusiona con la
  // anterior en un párrafo justificado.
  siguientesLineas.forEach((linea, i) => {
    const palabrasLinea = palabrasConEstilosPdf(linea, false);
    const subLineas = envolverPalabrasPdf(
      palabrasLinea,
      maxWidth,
      estilo.fontSizeBody,
      estilo.fontRegular,
      estilo.fontBold,
      estilo.fuentesExtra,
    );
    const esUltimaLineaDelBloque = i === siguientesLineas.length - 1;
    subLineas.forEach((subLinea, idx) => {
      const alto = altoLineaPdf(subLinea, estilo.fontSizeBody, estilo.lineHeightParrafo);
      estilo.checkSpace(cursor, alto);
      dibujarLineaMixtaPdf(
        cursor.page,
        subLinea,
        estilo.marginLeft + indent,
        cursor.y,
        maxWidth,
        estilo.fontSizeBody,
        estilo.fontRegular,
        estilo.fontBold,
        estilo.color,
        idx < subLineas.length - 1 || !esUltimaLineaDelBloque,
        estilo.fuentesExtra,
      );
      cursor.y -= alto;
    });
  });

  cursor.y -= 10;
}

function dibujarBloquesPdf(cursor: CursorPdf, estilo: EstiloCuerpoPdf, partes: ParteTexto[]) {
  for (const parte of partes) {
    if (parte.espacioExtra > 0) {
      const espacio = parte.espacioExtra * estilo.lineHeightParrafo;
      estilo.checkSpace(cursor, espacio);
      cursor.y -= espacio;
    }
    const estiloEfectivo =
      parte.sangrado && parte.tipo !== 'vineta'
        ? {
            ...estilo,
            marginLeft: estilo.marginLeft + INDENT_SANGRIA,
            contentWidth: estilo.contentWidth - INDENT_SANGRIA,
          }
        : estilo;
    if (parte.tipo === 'subtitulo') dibujarSubtituloPdf(cursor, estiloEfectivo, parte.texto);
    else if (parte.tipo === 'parrafo') dibujarParrafoPdf(cursor, estiloEfectivo, parte.texto);
    else if (parte.tipo === 'lista') dibujarListaPdf(cursor, estiloEfectivo, parte.lineas);
    else dibujarVinetaPdf(cursor, estilo, parte.label, parte.restoLineas);
  }
}

// ===== Imagen propia de encabezado o pie de página — puerto textual, con
// `fetch` global de Node (18+) en vez del `fetch` del navegador. =====

const ENCABEZADO_IMAGEN_ALTURA = 80;
const PIE_PAGINA_IMAGEN_ALTURA = 50;
const PIE_PAGINA_TEXTO_ALTURA = 20;
const PIE_PAGINA_MARGEN_BASE = 50;
const PIE_PAGINA_GAP = 10;

function dibujarImagenEnCajaPdf(
  page: PDFPage,
  config: { marginLeft: number; contentWidth: number; y: number; altura: number; image: PDFImage },
) {
  const { marginLeft, contentWidth, y, altura, image } = config;
  const escala = Math.min(contentWidth / image.width, altura / image.height);
  const anchoDibujo = image.width * escala;
  const altoDibujo = image.height * escala;
  page.drawImage(image, {
    x: marginLeft + (contentWidth - anchoDibujo) / 2,
    y: y - altura + (altura - altoDibujo) / 2,
    width: anchoDibujo,
    height: altoDibujo,
  });
}

function dibujarPiePaginaTextoPdf(
  page: PDFPage,
  config: {
    marginLeft: number;
    contentWidth: number;
    y: number;
    texto: string;
    font: PDFFont;
  },
) {
  const { marginLeft, contentWidth, y, texto, font } = config;
  const size = 8.5;
  const width = font.widthOfTextAtSize(texto, size);
  page.drawText(texto, {
    x: marginLeft + (contentWidth - width) / 2,
    y,
    size,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

async function embedImagenPdf(
  pdfDoc: PDFDocument,
  url: string,
): Promise<PDFImage | null> {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const bytes = await respuesta.arrayBuffer();
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      return await pdfDoc.embedPng(bytes);
    }
  } catch (err) {
    console.error(
      '[carta-pdf.util] No se pudo cargar la imagen (encabezado o pie de página), se omite para este PDF:',
      err,
    );
    return null;
  }
}

interface EncabezadoResuelto {
  altura: number;
  dibujar: (
    page: PDFPage,
    config: Omit<EncabezadoOficialConfig, 'logoImage'>,
    numeroPagina: number,
    totalPaginas: number,
  ) => void;
}

async function resolverEncabezadoDocumento(
  pdfDoc: PDFDocument,
  tipo: 'NINGUNO' | 'IMAGEN' | 'FORMATO_OFICIAL' | null | undefined,
  imagenUrl: string | null | undefined,
): Promise<EncabezadoResuelto> {
  if (tipo === 'NINGUNO') {
    return { altura: 0, dibujar: () => {} };
  }

  if (tipo === 'IMAGEN') {
    const image = imagenUrl ? await embedImagenPdf(pdfDoc, imagenUrl) : null;
    if (!image) {
      return { altura: 0, dibujar: () => {} };
    }
    return {
      altura: ENCABEZADO_IMAGEN_ALTURA,
      dibujar: (page, cfg) =>
        dibujarImagenEnCajaPdf(page, {
          marginLeft: cfg.marginLeft,
          contentWidth: cfg.contentWidth,
          y: cfg.headerTopY,
          altura: ENCABEZADO_IMAGEN_ALTURA,
          image,
        }),
    };
  }

  const logoBytes = leerLogoBytes();
  const logoImage = await pdfDoc.embedJpg(logoBytes);
  return {
    altura: ENCABEZADO_ALTURA,
    dibujar: (page, cfg, numeroPagina, totalPaginas) =>
      dibujarEncabezadoOficialPdf(page, { ...cfg, logoImage }, numeroPagina, totalPaginas),
  };
}

interface PiePaginaResuelto {
  altura: number;
  dibujar: (
    page: PDFPage,
    config: { marginLeft: number; contentWidth: number; y: number },
  ) => void;
}

async function resolverPiePaginaDocumento(
  pdfDoc: PDFDocument,
  tipo: 'NINGUNO' | 'TEXTO' | 'IMAGEN' | null | undefined,
  texto: string | null | undefined,
  imagenUrl: string | null | undefined,
  fontTexto: PDFFont,
): Promise<PiePaginaResuelto> {
  if (tipo === 'TEXTO' && texto) {
    return {
      altura: PIE_PAGINA_TEXTO_ALTURA,
      dibujar: (page, cfg) =>
        dibujarPiePaginaTextoPdf(page, {
          marginLeft: cfg.marginLeft,
          contentWidth: cfg.contentWidth,
          y: cfg.y - PIE_PAGINA_TEXTO_ALTURA / 2 - 3,
          texto,
          font: fontTexto,
        }),
    };
  }

  if (tipo === 'IMAGEN') {
    const image = imagenUrl ? await embedImagenPdf(pdfDoc, imagenUrl) : null;
    if (!image) {
      return { altura: 0, dibujar: () => {} };
    }
    return {
      altura: PIE_PAGINA_IMAGEN_ALTURA,
      dibujar: (page, cfg) =>
        dibujarImagenEnCajaPdf(page, {
          marginLeft: cfg.marginLeft,
          contentWidth: cfg.contentWidth,
          y: cfg.y,
          altura: PIE_PAGINA_IMAGEN_ALTURA,
          image,
        }),
    };
  }

  return { altura: 0, dibujar: () => {} };
}

// ===== Carta formal simple (encabezado + cuerpo) — puerto de
// generarCartaPdf (frontend). Devuelve Buffer en vez de File/Blob (no hay
// DOM en el backend); el resto del layout es idéntico. El cuerpo
// ("contenido") es genérico y 100% autoría del admin en "Contenido de la
// plantilla" (Parametrización > Documentos) — este generador ya no agrega
// fecha/destinatario/asunto por su cuenta; si un documento necesita esas
// líneas, el admin las escribe él mismo en el contenido, con variables como
// {{cliente_nombre}}/{{numero_solicitud}} si hacen falta datos dinámicos. =====

export interface GenerarCartaPdfOpciones {
  /** Texto completo del documento, con los placeholders ya reemplazados por
   * valores reales — es lo único que se dibuja como cuerpo, tal cual lo
   * escribió el admin en "Contenido de la plantilla". */
  contenido: string;
  /** Nombre lógico del documento (usado solo como metadata del PDF). */
  nombreArchivo?: string;
  /** Razón social mostrada en el encabezado (por defecto CARTONERA NACIONAL S.A.). */
  membreteRazonSocial?: string;
  /** Código de FORMATO mostrado en el encabezado, si esta carta tiene uno asociado. */
  formatoCodigo?: string;
  formatoCodigoSecundario?: string | null;
  revision?: string | null;
  revisiones?: RevisionDocumentoPdf[];
  /** Qué se dibuja en el encabezado de cada página. Default 'FORMATO_OFICIAL'. */
  encabezadoTipo?: 'NINGUNO' | 'IMAGEN' | 'FORMATO_OFICIAL';
  encabezadoImagenUrl?: string | null;
  /** Qué se dibuja en el pie de cada página. Default 'NINGUNO'. */
  piePaginaTipo?: 'NINGUNO' | 'TEXTO' | 'IMAGEN';
  piePaginaTexto?: string | null;
  piePaginaImagenUrl?: string | null;
}

export async function generarCartaPdf({
  contenido,
  nombreArchivo,
  membreteRazonSocial = 'CARTONERA NACIONAL S.A.',
  formatoCodigo = '-',
  formatoCodigoSecundario,
  revision,
  revisiones = [],
  encabezadoTipo = 'FORMATO_OFICIAL',
  encabezadoImagenUrl,
  piePaginaTipo = 'NINGUNO',
  piePaginaTexto,
  piePaginaImagenUrl,
}: GenerarCartaPdfOpciones): Promise<Buffer> {
  const partes = clasificarBloquesTexto(contenido);

  const pdfDoc = await PDFDocument.create();
  if (nombreArchivo) pdfDoc.setTitle(nombreArchivo);
  const fontRegular = await pdfDoc.embedFont('Times-Roman');
  const fontBold = await pdfDoc.embedFont('Times-Bold');
  const helvetica = await pdfDoc.embedFont('Helvetica');
  const helveticaBold = await pdfDoc.embedFont('Helvetica-Bold');
  const courier = await pdfDoc.embedFont('Courier');
  const courierBold = await pdfDoc.embedFont('Courier-Bold');
  const negro = rgb(0.1, 0.1, 0.1);
  const gris = rgb(0.35, 0.35, 0.35);

  const fuentesExtra = new Map<string, { regular: PDFFont; bold: PDFFont }>([
    ['Times-Roman', { regular: fontRegular, bold: fontBold }],
    ['Helvetica', { regular: helvetica, bold: helveticaBold }],
    ['Courier', { regular: courier, bold: courierBold }],
  ]);

  const encabezado = await resolverEncabezadoDocumento(
    pdfDoc,
    encabezadoTipo,
    encabezadoImagenUrl,
  );
  const piePagina = await resolverPiePaginaDocumento(
    pdfDoc,
    piePaginaTipo,
    piePaginaTexto,
    piePaginaImagenUrl,
    fontRegular,
  );

  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 50;
  const marginRight = 50;
  const marginTop = 50;
  const marginBottom =
    PIE_PAGINA_MARGEN_BASE +
    (piePagina.altura > 0 ? piePagina.altura + PIE_PAGINA_GAP : 0);
  const contentWidth = pageWidth - marginLeft - marginRight;
  const fontSizeBody = 11.5;

  const headerTopY = pageHeight - marginTop;
  const bodyTopY = headerTopY - encabezado.altura - 24;
  const piePaginaTopY = PIE_PAGINA_MARGEN_BASE + piePagina.altura;

  const paginas: PDFPage[] = [];
  const nuevaPagina = (): PDFPage => {
    const pagina = pdfDoc.addPage([pageWidth, pageHeight]);
    paginas.push(pagina);
    return pagina;
  };

  const cursor: CursorPdf = { page: nuevaPagina(), y: bodyTopY };

  const checkSpace = (c: CursorPdf, needed: number) => {
    if (c.y - needed < marginBottom) {
      c.page = nuevaPagina();
      c.y = bodyTopY;
    }
  };

  const estilo: EstiloCuerpoPdf = {
    marginLeft,
    contentWidth,
    fontSizeBody,
    fontRegular,
    fontBold,
    color: negro,
    lineHeightParrafo: 18,
    lineHeightLista: 19,
    checkSpace,
    fuentesExtra,
  };
  dibujarBloquesPdf(cursor, estilo, partes);

  checkSpace(cursor, 30);
  cursor.y -= 6;
  cursor.page.drawLine({
    start: { x: marginLeft, y: cursor.y },
    end: { x: marginLeft + contentWidth, y: cursor.y },
    thickness: 1,
    color: rgb(0.87, 0.87, 0.87),
  });
  cursor.y -= 14;
  const fechaGeneracion = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const footerTexto = `Documento generado electrónicamente el ${fechaGeneracion} · Sistema de Vinculación Comercial`;
  const footerWidth = fontRegular.widthOfTextAtSize(footerTexto, 8.5);
  cursor.page.drawText(footerTexto, {
    x: marginLeft + (contentWidth - footerWidth) / 2,
    y: cursor.y,
    size: 8.5,
    font: fontRegular,
    color: gris,
  });

  dibujarTablaRevisionesPdf(
    cursor as CursorSimplePdf,
    { marginLeft, contentWidth, fontRegular: helvetica, fontBold: helveticaBold, checkSpace },
    revisiones,
  );

  const totalPaginas = paginas.length;
  const encabezadoConfig: Omit<EncabezadoOficialConfig, 'logoImage'> = {
    marginLeft,
    contentWidth,
    headerTopY,
    fontRegular: helvetica,
    fontBold: helveticaBold,
    razonSocial: membreteRazonSocial,
    tituloDocumento: nombreArchivo || '',
    formatoCodigo,
    formatoCodigoSecundario,
    revision,
  };
  paginas.forEach((pagina, idx) => {
    encabezado.dibujar(pagina, encabezadoConfig, idx + 1, totalPaginas);
  });
  paginas.forEach((pagina) => {
    piePagina.dibujar(pagina, { marginLeft, contentWidth, y: piePaginaTopY });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
