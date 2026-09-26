// Formatted screenplay view of the typed elements (industry layout: centred
// cues and dialogue, right-aligned transitions).
import type { ScreenplayElement } from "@aurastage/contracts";

const STYLE: Record<ScreenplayElement["type"], string> = {
  scene_heading: "mt-6 font-bold uppercase",
  action: "mt-3 whitespace-pre-wrap",
  character: "mt-4 ml-[38%] uppercase",
  parenthetical: "ml-[30%] mr-[30%] text-white/60",
  dialogue: "ml-[22%] mr-[20%] whitespace-pre-wrap",
  transition: "mt-4 text-right uppercase",
  centered: "mt-3 text-center",
  section: "mt-6 text-aura-gold",
  note: "mt-2 text-xs italic text-white/40",
};

export function ScreenplayPreview({ elements }: { elements: ScreenplayElement[] }) {
  if (elements.length === 0) {
    return <p className="p-6 text-sm text-white/40">Nothing to preview yet.</p>;
  }
  return (
    <div className="font-mono text-[13px] leading-relaxed text-white/90">
      {elements.map((el) => (
        <p key={el.index} className={STYLE[el.type]}>
          {el.text}
        </p>
      ))}
    </div>
  );
}
