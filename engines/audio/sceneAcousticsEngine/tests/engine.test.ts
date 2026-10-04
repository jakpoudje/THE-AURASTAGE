import { describe, expect, it } from "vitest";
import { sceneAcousticsEngine } from "../engine";
import { ENGINE_VERSION } from "../version";

const scene = (int_ext: string, location: string, time_of_day: string | null = "DAY") => ({ int_ext, location, time_of_day });

describe("sceneAcousticsEngine (R4 sound realism)", () => {
  it("reads the space from the place's name and cites it", () => {
    expect(sceneAcousticsEngine({ scene: scene("INT", "DANFO BUS") }).space.id).toBe("small_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "ST. MARY'S CHURCH") }).space.id).toBe("large_hall");
    expect(sceneAcousticsEngine({ scene: scene("INT", "CATHEDRAL") }).space.id).toBe("cathedral");
    expect(sceneAcousticsEngine({ scene: scene("EXT", "OSHODI MARKET") }).space.id).toBe("outdoor");
    const r = sceneAcousticsEngine({ scene: scene("INT", "AMARA'S BEDROOM") });
    expect(r.why.join(" ")).toMatch(/bedroom/i);
    expect(r.engine_version).toBe(ENGINE_VERSION);
  });

  it("a size in the Locations & Props description wins over the kind of room; an unnamed interior is a medium room", () => {
    expect(sceneAcousticsEngine({ scene: scene("INT", "NEWSROOM"), location_description: "A vast, echoing open-plan floor" }).space.id).toBe("large_hall");
    expect(sceneAcousticsEngine({ scene: scene("INT", "TOWN HALL"), location_description: "A cramped hall with a low ceiling" }).space.id).toBe("small_room");
    const plain = sceneAcousticsEngine({ scene: scene("INT", "AMARA'S PLACE") });
    expect(plain.space.id).toBe("medium_room");
    expect(plain.why[0]).toMatch(/no size or kind of room/);
  });

  it("the place's own name comes before a passing word in its description", () => {
    expect(sceneAcousticsEngine({ scene: scene("INT", "TUNDE'S OFFICE"), location_description: "A small office at the end of the hall" }).space.id).toBe("small_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "BEDROOM"), location_description: "Down the hall from the kitchen" }).space.id).toBe("small_room");
  });

  it("an exterior is open air unless it is somewhere enclosed", () => {
    expect(sceneAcousticsEngine({ scene: scene("EXT", "ROOFTOP", "NIGHT") }).space.id).toBe("outdoor");
    expect(sceneAcousticsEngine({ scene: scene("EXT", "THIRD MAINLAND BRIDGE UNDERPASS") }).space.id).toBe("large_hall");
  });

  it("dialogue gets a reverb send sized to the space: close in a car, long in a hall, almost dry outdoors", () => {
    const car = sceneAcousticsEngine({ scene: scene("INT", "TAXI") }).dx_fx;
    const hall = sceneAcousticsEngine({ scene: scene("INT", "TOWN HALL") }).dx_fx;
    const street = sceneAcousticsEngine({ scene: scene("EXT", "STREET") }).dx_fx;
    expect(hall.reverb_send_db).toBeGreaterThan(car.reverb_send_db);
    expect(car.reverb_send_db).toBeGreaterThan(street.reverb_send_db);
    expect(street.hpf_hz).toBeGreaterThan(car.hpf_hz); // more low cut for wind and traffic rumble
    expect(car.comp.on).toBe(true);
  });

  it("the background bed is room tone inside and an open, dry bed outside (a night preset at night)", () => {
    const inside = sceneAcousticsEngine({ scene: scene("INT", "BEDROOM") });
    expect(inside.bed).toBe("small room tone");
    expect(inside.bg_fx.lpf_hz).toBeGreaterThan(0);
    const night = sceneAcousticsEngine({ scene: scene("EXT", "STREET", "NIGHT") });
    expect(night.bed).toBe("open exterior at night");
    expect(night.bg_fx.reverb_send_db).toBe(-60);
  });

  it("footsteps across a shot where someone walks or runs; a door on the cut when someone comes in; as they leave near the end", () => {
    const r = sceneAcousticsEngine({
      scene: scene("INT", "NEWSROOM"),
      shots: [
        { ordinal: 1, story_start: 0, story_end: 4, description: "Wide: the newsroom hums." },
        { ordinal: 2, story_start: 4, story_end: 9, description: "Amara enters and walks to Tunde's desk." },
        { ordinal: 3, story_start: 9, story_end: 14, description: "Tunde runs out of the room." },
        { ordinal: 4, story_start: 14, story_end: 18, description: "She slams the door behind her." },
      ],
    });
    const steps = r.foley.filter((f) => f.kind === "footsteps");
    expect(steps.map((f) => f.shot_ordinal)).toEqual([2, 3]);
    expect(steps[0]).toMatchObject({ label: "Footsteps on the floor", start_seconds: 4.2 });
    expect(steps[1].label).toBe("Running footsteps on the floor");
    expect(steps[0].evidence).toContain("Amara enters");
    const doors = r.foley.filter((f) => f.kind === "door");
    expect(doors.find((d) => d.shot_ordinal === 2)).toMatchObject({ label: "Door opens", start_seconds: 4 });
    expect(doors.find((d) => d.shot_ordinal === 4)).toMatchObject({ label: "Door slams" });
    expect(r.foley.some((f) => f.shot_ordinal === 1)).toBe(false);
  });

  it("outside, nobody comes in through a door unless one is named", () => {
    const r = sceneAcousticsEngine({
      scene: scene("EXT", "OSHODI MARKET"),
      shots: [
        { ordinal: 1, story_start: 0, story_end: 5, description: "Amara enters the market." },
        { ordinal: 2, story_start: 5, story_end: 8, description: "Tunde pushes open the gate and steps inside." },
      ],
    });
    expect(r.foley.filter((f) => f.kind === "door").map((f) => f.label)).toEqual(["Gate opens"]);
    expect(r.foley.find((f) => f.kind === "footsteps")!.label).toBe("Footsteps on the street");
  });

  it("regression: \"Close on Tunde\" is a shot size, not a door closing", () => {
    const r = sceneAcousticsEngine({ scene: scene("EXT", "LAGOS HARBOUR", "NIGHT"),
      shots: [{ ordinal: 2, story_start: 4, story_end: 10, description: "Close on Tunde. Behind him, a door slams in the harbour office." }] });
    expect(r.foley.map((f) => f.label)).toEqual(["Door slams"]);
  });

  it("owner's film: a description of the whole building doesn't resize the room; the heading's own area comes first", () => {
    // "Debate Hall … Look: white and narrow" — narrow is the backstage corridor, not the hall.
    expect(sceneAcousticsEngine({ scene: scene("INT", "DEBATE HALL", "NIGHT"),
      location_description: "Debate Hall: interior. Seen at night. Areas: Backstage Corridor. Look: white and narrow. From the script: \"A television studio dressed as a conference hall.\"" }).space.id).toBe("large_hall");
    expect(sceneAcousticsEngine({ scene: scene("INT", "DEBATE HALL - BACKSTAGE CORRIDOR", "NIGHT") }).space.id).toBe("medium_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "ADAMU RESIDENCE - CORRIDOR"),
      location_description: "The private residence of Sule Adamu … a large walled mansion … " + "x".repeat(300) + " a grand hall" }).space.id).toBe("medium_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "COMMISSION HEADQUARTERS"),
      location_description: "The national headquarters of the electoral commission: a large federal office block … " + "x".repeat(300) + " a narrow corridor" }).space.id).toBe("medium_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "TV STUDIO", "NIGHT"), location_description: "Tv Studio: interior. Seen at night. Look: cramped, glass, plastic and new." }).space.id).toBe("small_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "PRESIDENTIAL VILLA - ANTEROOM") }).space.id).toBe("small_room");
    expect(sceneAcousticsEngine({ scene: scene("INT", "RIVERS COLLATION CENTRE") }).space.id).toBe("large_hall");
  });
});
