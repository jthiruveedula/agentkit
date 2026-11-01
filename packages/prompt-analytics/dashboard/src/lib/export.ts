// Session exports: CSV, JSON and a minimal .xlsx (SpreadsheetML in a "stored" zip, no dependency).
// Pure: every serializer takes the rows in view, in view order. Cost stays null / empty when unpriced, never 0.
import type { SessionRow } from "../data/types";

export type Fmt = "csv" | "json" | "xlsx";
type Cell = string | number | boolean | null;
type Kind = "str" | "num" | "usd" | "date" | "bool";
const COLS: { key: string; kind: Kind; get: (r: SessionRow) => Cell }[] = [
  { key: "date", kind: "date", get: (r) => r.date.slice(0, 10) },
  { key: "tool", kind: "str", get: (r) => r.source },
  { key: "project", kind: "str", get: (r) => r.project },
  { key: "intent", kind: "str", get: (r) => r.intent },
  { key: "title", kind: "str", get: (r) => r.title },
  { key: "prompts", kind: "num", get: (r) => r.prompts },
  { key: "tokens", kind: "num", get: (r) => r.tokens },
  { key: "cost_usd", kind: "usd", get: (r) => r.cost_usd },
  { key: "friction", kind: "num", get: (r) => +r.friction.toFixed(2) },
  { key: "applied", kind: "bool", get: (r) => r.applied },
];
export const HEAD = COLS.map((c) => c.key);

export const fileName = (fmt: Fmt, now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `prompt-analytics-sessions-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.${fmt}`;
};

/** CSV cell: quote everything, and neutralise leading = + - @ tab CR so a spreadsheet never runs a title as a formula. */
export const csvCell = (x: Cell) => { const s = x === null ? "" : String(x); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
export function toCsv(rows: SessionRow[]): string {
  return [HEAD.map(csvCell).join(","), ...rows.map((r) => COLS.map((c) => csvCell(c.get(r))).join(","))].join("\n");
}

export function toJson(rows: SessionRow[], filters: Record<string, unknown> = {}, now = new Date()): string {
  const out = rows.map((r) => Object.fromEntries(COLS.map((c) => [c.key, c.get(r)])));
  return JSON.stringify({ meta: { generated_at: now.toISOString(), filters, count: rows.length }, sessions: out }, null, 2);
}

// ---- xlsx ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

const enc = new TextEncoder();
/** Zip with method 0 (stored): fixed 1980-01-01 timestamp so the bytes are deterministic. */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  const hdr = (n: number, f: (v: DataView) => void) => { const b = new Uint8Array(n); f(new DataView(b.buffer)); return b; };
  for (const { name, data } of files) {
    const nm = enc.encode(name), crc = crc32(data);
    const local = hdr(30, (v) => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(10, 0, true); v.setUint16(12, 33, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, nm.length, true); });
    central.push(hdr(46, (v) => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(14, 33, true); v.setUint32(16, crc, true); v.setUint32(20, data.length, true); v.setUint32(24, data.length, true); v.setUint16(28, nm.length, true); v.setUint32(42, off, true); }), nm);
    parts.push(local, nm, data); off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = hdr(22, (v) => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, cdSize, true); v.setUint32(16, off, true); });
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => String.fromCharCode(65 + i);
/** Excel serial day for an ISO date (1900 system). */
export const serial = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5 + 25569;
const S = { head: 1, date: 2, usd: 3 };

function sheet(rows: SessionRow[]): string {
  const line = (n: number, cells: string[]) => `<row r="${n}">${cells.join("")}</row>`;
  const str = (ref: string, s: string, style = 0) => `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(s)}</t></is></c>`;   // inline strings are literal text: a leading "=" is never a formula
  const body = rows.map((r, i) => line(i + 2, COLS.map((c, j) => {
    const ref = `${colName(j)}${i + 2}`, v = c.get(r);
    if (v === null) return "";   // null stays an empty cell
    if (c.kind === "date") return `<c r="${ref}" s="${S.date}"><v>${serial(String(v))}</v></c>`;
    if (c.kind === "num") return `<c r="${ref}"><v>${v}</v></c>`;
    if (c.kind === "usd") return `<c r="${ref}" s="${S.usd}"><v>${v}</v></c>`;
    if (c.kind === "bool") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    return str(ref, String(v));
  })));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/><col min="5" max="5" width="48" customWidth="1"/></cols><sheetData>${[line(1, HEAD.map((h, j) => str(`${colName(j)}1`, h, S.head))), ...body].join("")}</sheetData></worksheet>`;
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", HD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function toXlsx(rows: SessionRow[]): Uint8Array {
  const f = (name: string, text: string) => ({ name, data: enc.encode(text) });
  return zipStored([
    f("[Content_Types].xml", `${HD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    f("_rels/.rels", `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f("xl/workbook.xml", `${HD}<workbook ${NS} xmlns:r="${REL}"><sheets><sheet name="Sessions" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    f("xl/_rels/workbook.xml.rels", `${HD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
    f("xl/styles.xml", `${HD}<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
    f("xl/worksheets/sheet1.xml", sheet(rows)),
  ]);
}

export const MIME: Record<Fmt, string> = { csv: "text/csv;charset=utf-8", json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export function serialize(fmt: Fmt, rows: SessionRow[], filters: Record<string, unknown> = {}): string | Uint8Array {
  return fmt === "csv" ? toCsv(rows) : fmt === "json" ? toJson(rows, filters) : toXlsx(rows);
}

/** Browser download of text or bytes. */
export function saveFile(name: string, data: string | Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
