import { describe, expect, it } from "vitest";
import { screenplayImportEngine } from "../engine";
import { screenplayFormatEngine } from "../../screenplayFormatEngine/engine";
import { sceneBoundaryEngine } from "../../sceneBoundaryEngine/engine";

const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>int. newsroom - morning</Text></Paragraph>
    <Paragraph Type="Action"><Text>TUNDE OKAFOR (35) reviews documents. </Text><Text Style="Bold">Fast.</Text></Paragraph>
    <Paragraph Type="Character"><Text>Tunde</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Someone has to tell the truth &amp; I&apos;m that someone.</Text></Paragraph>
    <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>THE ROOFTOP - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>BOOM.</Text></Paragraph>
    <Paragraph Type="Character"><Text>AMARA (V.O.)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>You came.</Text></Paragraph>
    <Paragraph Type="Cast List"><Text>Ignored type</Text></Paragraph>
  </Content>
  <TitlePage><Content><Paragraph><Text>Shadows of Lagos</Text></Paragraph></Content></TitlePage>
</FinalDraft>`;

describe("screenplayImportEngine", () => {
  it("converts Final Draft XML into screenplay text the format engine understands", () => {
    const out = screenplayImportEngine({ file_name: "Shadows.FDX", content: FDX });
    expect(out.format).toBe("fdx");
    const { elements } = screenplayFormatEngine({ source_text: out.source_text });
    expect(elements.map((e) => e.type)).toEqual([
      "scene_heading", "action", "character", "parenthetical", "dialogue", "transition",
      "scene_heading", "action", "character", "dialogue", "action",
    ]);
    expect(elements[0].text).toBe("INT. NEWSROOM - MORNING");
    expect(elements[1].text).toBe("TUNDE OKAFOR (35) reviews documents. Fast.");
    expect(elements[4].text).toBe("Someone has to tell the truth & I'm that someone.");
    // Non-standard heading is forced so it still starts a scene.
    expect(elements[6].text).toBe("THE ROOFTOP - NIGHT");
    // All-caps action is not mistaken for a character cue.
    expect(elements[7]).toMatchObject({ type: "action", text: "BOOM." });
    expect(elements[8].speaker).toBe("AMARA");
    expect(out.warnings.join(" ")).toContain("Cast List");
  });

  it("keeps the title page out of the screenplay", () => {
    const out = screenplayImportEngine({ file_name: "a.fdx", content: FDX });
    expect(out.source_text).not.toContain("Shadows of Lagos");
  });

  it("imported scenes and speakers match the source", () => {
    const text = screenplayImportEngine({ file_name: "a.fdx", content: FDX }).source_text;
    const { scenes } = sceneBoundaryEngine({ elements: screenplayFormatEngine({ source_text: text }).elements });
    expect(scenes.map((s) => [s.heading, s.speaking_characters])).toEqual([
      ["INT. NEWSROOM - MORNING", ["TUNDE"]],
      ["THE ROOFTOP - NIGHT", ["AMARA"]],
    ]);
  });

  it("passes Fountain through, dropping a title page", () => {
    const out = screenplayImportEngine({
      file_name: "s.fountain",
      content: "Title: Shadows of Lagos\nAuthor: Julius\n\nINT. ROOM - DAY\n\nHello.\n",
    });
    expect(out.format).toBe("fountain");
    expect(out.source_text).toBe("INT. ROOM - DAY\n\nHello.\n");
    expect(out.warnings).toHaveLength(1);
  });

  it("leaves Fountain without a title page untouched (except line endings)", () => {
    const out = screenplayImportEngine({ file_name: "s.txt", content: "INT. ROOM - DAY\r\n\r\nHi.\r\n" });
    expect(out.source_text).toBe("INT. ROOM - DAY\n\nHi.\n");
    expect(out.warnings).toEqual([]);
  });

  it("explains unsupported files in plain language", () => {
    expect(() => screenplayImportEngine({ file_name: "s.pdf", content: "%PDF" })).toThrow(/PDF import isn't supported yet/);
    expect(() => screenplayImportEngine({ file_name: "s.docx", content: "x" })).toThrow(/Unsupported file type/);
    expect(() => screenplayImportEngine({ file_name: "s.fdx", content: "<FinalDraft></FinalDraft>" })).toThrow(/no screenplay content/);
  });
});
