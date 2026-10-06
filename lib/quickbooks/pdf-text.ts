import zlib from 'zlib';

/**
 * Minimal text extraction for QuickBooks PDFs (Chromium/Skia output: plain objects, Type0 fonts
 * with ToUnicode maps, one text run per BT…ET). Returns one string per text run, or null when
 * the file does not look like that, so callers can treat "unreadable" differently from "absent".
 */

type PdfObject = { dict: string; stream: Buffer | null };

type FontMap = { codeBytes: number; map: Map<number, string> };

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = header.exec(text))) {
    const start = m.index + m[0].length;
    const endObj = text.indexOf('endobj', start);
    if (endObj < 0) break;
    const streamAt = text.indexOf('stream', start);
    if (streamAt < 0 || streamAt > endObj) {
      objects.set(Number(m[1]), { dict: text.slice(start, endObj), stream: null });
      header.lastIndex = endObj + 6;
      continue;
    }
    const dict = text.slice(start, streamAt);
    let dataStart = streamAt + 6;
    if (text[dataStart] === '\r') dataStart++;
    if (text[dataStart] === '\n') dataStart++;
    // A direct /Length is exact; binary data can contain "endobj" by chance.
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const dataEnd = length ? dataStart + Number(length[1]) : text.indexOf('endstream', dataStart);
    if (dataEnd < dataStart) break;
    objects.set(Number(m[1]), { dict, stream: pdf.subarray(dataStart, dataEnd) });
    const realEnd = text.indexOf('endobj', dataEnd);
    if (realEnd < 0) break;
    header.lastIndex = realEnd + 6;
  }
  return objects;
}

function streamText(obj: PdfObject | undefined): string | null {
  if (!obj?.stream) return null;
  try {
    const data = /\/FlateDecode/.test(obj.dict) ? zlib.inflateSync(obj.stream) : obj.stream;
    return data.toString('latin1');
  } catch {
    return null;
  }
}

function refId(dict: string, key: string): number | null {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
}

function utf16HexToString(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}

export function parseToUnicodeCMap(cmap: string): FontMap {
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap);
  const codeBytes = space ? Math.max(1, space[1]!.length / 2) : 2;
  const map = new Map<number, string>();

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(parseInt(pair[1]!, 16), utf16HexToString(pair[2]!));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
    for (const r of block[1]!.matchAll(re)) {
      const lo = parseInt(r[1]!, 16);
      const hi = parseInt(r[2]!, 16);
      if (hi < lo || hi - lo > 0xffff) continue;
      if (r[3] != null) {
        const base = r[3];
        const head = base.slice(0, -4);
        const last = parseInt(base.slice(-4), 16);
        for (let c = lo; c <= hi; c++) {
          map.set(c, utf16HexToString(head + (last + c - lo).toString(16).padStart(4, '0')));
        }
      } else {
        const dsts = [...r[4]!.matchAll(/<([0-9A-Fa-f]*)>/g)].map((d) => d[1]!);
        dsts.forEach((d, i) => map.set(lo + i, utf16HexToString(d)));
      }
    }
  }
  return { codeBytes, map };
}

function decodeBytes(bytes: number[], font: FontMap | undefined): string {
  if (!font) return String.fromCharCode(...bytes);
  let out = '';
  for (let i = 0; i + font.codeBytes <= bytes.length; i += font.codeBytes) {
    let code = 0;
    for (let b = 0; b < font.codeBytes; b++) code = code * 256 + bytes[i + b]!;
    out += font.map.get(code) ?? '';
  }
  return out;
}

function hexBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, '');
  const even = clean.length % 2 ? `${clean}0` : clean;
  const out: number[] = [];
  for (let i = 0; i < even.length; i += 2) out.push(parseInt(even.slice(i, i + 2), 16));
  return out;
}

function literalBytes(lit: string): number[] {
  const body = lit.slice(1, -1);
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== '\\') {
      out.push(ch.charCodeAt(0) & 0xff);
      continue;
    }
    const next = body[++i] ?? '';
    const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    if (next in esc) out.push(esc[next]!);
    else if (/[0-7]/.test(next)) {
      const oct = /^[0-7]{1,3}/.exec(body.slice(i))![0];
      out.push(parseInt(oct, 8) & 0xff);
      i += oct.length - 1;
    } else if (next) out.push(next.charCodeAt(0) & 0xff);
  }
  return out;
}

const TOKEN =
  /<<|>>|<([0-9A-Fa-f\s]*)>|\[|\]|\((?:\\[\s\S]|[^\\()])*\)|\/[^\s/[\]()<>{}%]+|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z'"*]+/g;

/** Text runs from one content stream, using the page's font resources. */
export function contentStreamTextRuns(content: string, fonts: Map<string, FontMap>): string[] {
  const runs: string[] = [];
  let current = '';
  let font: FontMap | undefined;
  let operands: string[] = [];
  let array: string[] | null = null;
  const flush = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) runs.push(line);
    current = '';
  };
  const show = (tok: string) => {
    if (tok.startsWith('<')) current += decodeBytes(hexBytes(tok.slice(1, -1)), font);
    else if (tok.startsWith('(')) current += decodeBytes(literalBytes(tok), font);
    else if (Number(tok) < -250) current += ' ';
  };

  for (const m of content.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok === '[') {
      array = [];
      continue;
    }
    if (tok === ']') {
      operands.push(`[${(array ?? []).length}]`);
      continue;
    }
    if (array && tok !== 'TJ') {
      if (/^[A-Za-z'"*]+$/.test(tok)) array = null;
      else {
        array.push(tok);
        continue;
      }
    }
    if (!/^[A-Za-z'"*]+$/.test(tok)) {
      operands.push(tok);
      continue;
    }
    switch (tok) {
      case 'BT':
        current = '';
        break;
      case 'ET':
      case 'T*':
        flush();
        break;
      case 'Tf':
        font = fonts.get(operands[operands.length - 2]?.slice(1) ?? '');
        break;
      case 'Tj':
        show(operands[operands.length - 1] ?? '');
        break;
      case "'":
      case '"':
        flush();
        show(operands[operands.length - 1] ?? '');
        break;
      case 'TJ':
        for (const t of array ?? []) show(t);
        array = null;
        break;
    }
    operands = [];
  }
  flush();
  return runs;
}

function fontsForPage(page: PdfObject, objects: Map<number, PdfObject>, cache: Map<number, FontMap>) {
  const fonts = new Map<string, FontMap>();
  const resourcesId = refId(page.dict, 'Resources');
  const resources = resourcesId != null ? (objects.get(resourcesId)?.dict ?? '') : page.dict;
  const fontDictId = refId(resources, 'Font');
  const fontDict = fontDictId != null ? (objects.get(fontDictId)?.dict ?? '') : /\/Font\s*<<([\s\S]*?)>>/.exec(resources)?.[1] ?? '';
  for (const entry of fontDict.matchAll(/\/([^\s/<>[\]]+)\s+(\d+)\s+\d+\s+R/g)) {
    const fontId = Number(entry[2]);
    const toUnicodeId = refId(objects.get(fontId)?.dict ?? '', 'ToUnicode');
    if (toUnicodeId == null) continue;
    let parsed = cache.get(toUnicodeId);
    if (!parsed) {
      const cmap = streamText(objects.get(toUnicodeId));
      if (!cmap) continue;
      parsed = parseToUnicodeCMap(cmap);
      cache.set(toUnicodeId, parsed);
    }
    fonts.set(entry[1]!, parsed);
  }
  return fonts;
}

export function extractPdfTextRuns(pdf: Buffer): string[] | null {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
  const objects = parseObjects(pdf);
  const cmapCache = new Map<number, FontMap>();
  const runs: string[] = [];
  for (const obj of objects.values()) {
    if (!/\/Type\s*\/Page\b(?!s)/.test(obj.dict)) continue;
    const fonts = fontsForPage(obj, objects, cmapCache);
    const list = /\/Contents\s*\[([^\]]*)\]/.exec(obj.dict)?.[1];
    const contentIds = list
      ? [...list.matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => Number(r[1]))
      : [refId(obj.dict, 'Contents')].filter((id): id is number => id != null);
    for (const id of contentIds) {
      const content = streamText(objects.get(id));
      if (content) runs.push(...contentStreamTextRuns(content, fonts));
    }
  }
  return runs.length > 0 ? runs : null;
}
