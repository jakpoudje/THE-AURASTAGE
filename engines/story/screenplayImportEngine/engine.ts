// engines/story/screenplayImportEngine
// Converts an imported screenplay file into the Fountain-style text the rest
// of the Scriptwriter works with (SRS §4: "generate/import/edit screenplay").
// Supports Final Draft .fdx (XML) and Fountain/plain text. Pure string
// processing, so it runs identically in the browser and in workers.

import { FDX_EXTENSION, FDX_TYPE_MAP, STANDARD_HEADING_RE, TEXT_EXTENSIONS } from "./rules";
import { ScreenplayImportError, validateScreenplayImportInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { ScreenplayImportOutput } from "./output.schema";

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function paragraphText(inner: string): string {
  const runs = [...inner.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>|<Text\b[^>]*\/>/g)].map((m) => m[1] ?? "");
  return decodeEntities(runs.join("")).replace(/\r\n?/g, "\n").trim();
}

function fdxToFountain(xml: string, warnings: string[]): string {
  const content = xml.match(/<Content\b[^>]*>([\s\S]*?)<\/Content>/);
  if (!content) throw new ScreenplayImportError("This .fdx file has no screenplay content we can read.");

  const out: string[] = [];
  let inDialogueBlock = false;
  const unknownTypes = new Set<string>();

  for (const m of content[1].matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/g)) {
    const typeAttr = m[1].match(/\bType="([^"]*)"/)?.[1] ?? "Action";
    const text = paragraphText(m[2]);
    if (!text) continue;
    const kind = FDX_TYPE_MAP[typeAttr];
    if (!kind) unknownTypes.add(typeAttr);

    switch (kind ?? "action") {
      case "scene_heading": {
        const upper = text.toUpperCase();
        out.push("", STANDARD_HEADING_RE.test(upper) ? upper : `.${upper}`);
        inDialogueBlock = false;
        break;
      }
      case "character":
        out.push("", text.toUpperCase());
        inDialogueBlock = true;
        break;
      case "parenthetical":
      case "dialogue":
        if (!inDialogueBlock) {
          // Orphan dialogue without a cue: keep the words as action rather than lose them.
          out.push("", text);
          warnings.push("Some dialogue had no character name above it and was imported as action.");
        } else {
          out.push(kind === "parenthetical" && !text.startsWith("(") ? `(${text})` : text);
        }
        break;
      case "transition": {
        const upper = text.toUpperCase();
        out.push("", upper.endsWith("TO:") ? upper : `> ${upper}`);
        inDialogueBlock = false;
        break;
      }
      case "shot":
      case "action":
      default:
        out.push("", text.startsWith("!") ? text : isAllCaps(text) ? `!${text}` : text);
        inDialogueBlock = false;
    }
  }

  if (unknownTypes.size) {
    warnings.push(`Imported these Final Draft paragraph types as action: ${[...unknownTypes].join(", ")}.`);
  }
  return out.join("\n").replace(/^\n+/, "") + "\n";
}

/** An all-caps action line could be misread as a character cue; "!" forces it to stay action. */
function isAllCaps(s: string): boolean {
  const first = s.split("\n")[0];
  return /[A-Z]/.test(first) && first === first.toUpperCase() && !s.includes("\n");
}

export function screenplayImportEngine(rawInput: unknown): ScreenplayImportOutput {
  const { file_name, content } = validateScreenplayImportInput(rawInput);
  const name = file_name.toLowerCase();
  const warnings: string[] = [];
  const looksLikeFdx = content.trimStart().startsWith("<?xml") && content.includes("<FinalDraft");

  if (name.endsWith(FDX_EXTENSION) || looksLikeFdx) {
    return { source_text: fdxToFountain(content, warnings), format: "fdx", warnings: [...new Set(warnings)], engine_version: ENGINE_VERSION };
  }
  if (name.endsWith(".pdf")) {
    throw new ScreenplayImportError("PDF import isn't supported yet. Export your script from your writing app as Final Draft (.fdx) or Fountain (.fountain) instead.");
  }
  if (!TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new ScreenplayImportError("Unsupported file type. Use a Final Draft (.fdx), Fountain (.fountain) or plain text (.txt) file.");
  }
  // Fountain title page ("Title: ...") is metadata, not screenplay; drop it so it isn't parsed as action.
  const normalised = content.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const titlePage = normalised.match(/^(?:[A-Za-z ]+:.*\n(?:[ \t]{3,}.*\n)*)+\n/);
  if (titlePage && /^(title|credit|author|authors|source|draft date|contact|copyright|notes)\s*:/i.test(normalised)) {
    warnings.push("The title page was left out; only the screenplay itself was imported.");
    return { source_text: normalised.slice(titlePage[0].length), format: "fountain", warnings, engine_version: ENGINE_VERSION };
  }
  return { source_text: normalised, format: "fountain", warnings, engine_version: ENGINE_VERSION };
}
