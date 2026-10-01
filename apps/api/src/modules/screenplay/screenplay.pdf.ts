// apps/api/src/modules/screenplay/screenplay.pdf.ts — PDF script import (BUILD_PLAN §8 item 13). Reads the text runs and
// their positions from the PDF (unpdf / pdf.js, no network) and rebuilds the screenplay with pdfScreenplayEngine. Nothing
// is saved here: the text opens in the editor like any import, and the writer saves it as a version (rule 10).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";
import { pdfScreenplayEngine } from "@aurastage/engines";
import { assertProjectAccess } from "./screenplay.permissions";
import { ScriptValidationError } from "./screenplay.validator";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function importPdf(db: SupabaseClient, projectId: string, body: unknown) {
  await assertProjectAccess(db, projectId);
  const buf = Buffer.isBuffer(body) ? body : null;
  if (!buf || buf.length < 8 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ScriptValidationError([], "That isn't a PDF file.");
  if (buf.length > MAX_PDF_BYTES) throw new ScriptValidationError([], "That PDF is over 20 MB.");
  let doc;
  try { doc = await getDocumentProxy(new Uint8Array(buf)); } catch { throw new ScriptValidationError([], "That PDF couldn't be read — it may be damaged or password-protected."); }
  if (doc.numPages > 600) throw new ScriptValidationError([], "That PDF has more than 600 pages.");
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = (tc.items as { str?: string; transform?: number[] }[])
      .filter((it) => typeof it.str === "string" && it.str.trim() && Array.isArray(it.transform))
      .slice(0, 20000)
      .map((it) => ({ x: it.transform![4], y: it.transform![5], text: it.str!.slice(0, 2000) }));
    pages.push({ width: vp.width, height: vp.height, items });
  }
  if (!pages.some((p) => p.items.length)) throw new ScriptValidationError([], "That PDF has no text in it — a scanned script needs to be typed or run through text recognition first.");
  return pdfScreenplayEngine({ pages });
}
