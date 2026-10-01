// PDF script import end to end: a real PDF (built here, with text placed at screenplay indents) → unpdf → engine → Fountain.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerScreenplayRoutes } from "../screenplay.controller";

const PROJECT = "11111111-1111-4111-8111-111111111111";

/** A minimal one-page PDF with each [x, y, text] drawn in Courier 12. */
function pdf(lines: [number, number, string][]) {
  const esc = (t: string) => t.replace(/[\\()]/g, (m) => `\\${m}`);
  const content = lines.map(([x, y, t]) => `BT /F1 12 Tf ${x} ${y} Td (${esc(t)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function app() {
  const a = Fastify();
  const db = { from: () => { const q: any = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: { id: PROJECT }, error: null }), then: (ok: any) => ok({ data: [{ id: PROJECT }], error: null }) }; return q; } };
  a.addHook("onRequest", async (req) => void ((req as any).db = db));
  await registerScreenplayRoutes(a);
  return a;
}

describe("PDF script import", () => {
  it("reads a screenplay PDF back into a screenplay: headings, action, cue, parenthetical, dialogue, transition", async () => {
    const body = pdf([[108, 700, "INT. NEWSROOM - NIGHT"], [108, 676, "Rain against the glass. AMARA types."], [266, 652, "AMARA"], [223, 640, "(quietly)"], [180, 628, "They buried it."], [460, 604, "CUT TO:"], [108, 580, "EXT. HARBOUR - DAWN"]]);
    const res = await (await app()).inject({ method: "POST", url: `/api/projects/${PROJECT}/script/import-pdf`, headers: { "content-type": "application/pdf" }, payload: body });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.source_text).toBe("INT. NEWSROOM - NIGHT\n\nRain against the glass. AMARA types.\n\nAMARA\n(quietly)\nThey buried it.\n\n> CUT TO:\n\nEXT. HARBOUR - DAWN\n");
    expect(r.counts).toMatchObject({ heading: 2, character: 1, dialogue: 1, parenthetical: 1, transition: 1 });
  });
  it("refuses something that isn't a PDF, plainly (400)", async () => {
    const res = await (await app()).inject({ method: "POST", url: `/api/projects/${PROJECT}/script/import-pdf`, headers: { "content-type": "application/pdf" }, payload: Buffer.from("hello there, not a pdf") });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("That isn't a PDF file.");
  });
});
