import { describe, expect, it } from "vitest";
import { dueKnowledgeSlots, localKnowledgeClock } from "../src/lib/knowledge-schedule";

describe("Knowledge Steward schedule clock", () => {
  it("uses the project's local date and returns all elapsed local slots", () => {
    const now = new Date("2026-09-28T18:30:00.000Z");
    expect(dueKnowledgeSlots(now, "America/Chicago", ["08:00", "13:00", "18:00", "23:00"])).toEqual([
      { localDate: "2026-09-28", slot: "08:00" },
      { localDate: "2026-09-28", slot: "13:00" },
    ]);
  });

  it("respects daylight saving time without shifting the owner's wall-clock slot", () => {
    const before = localKnowledgeClock(new Date("2026-03-08T13:30:00.000Z"), "America/Chicago");
    const after = localKnowledgeClock(new Date("2026-03-09T13:30:00.000Z"), "America/Chicago");
    expect(before).toEqual({ localDate: "2026-03-08", minutes: 510 });
    expect(after).toEqual({ localDate: "2026-03-09", minutes: 510 });
  });

  it("catches a late-night slot on the next hourly check", () => {
    const now = new Date("2026-09-29T05:30:00.000Z");
    expect(dueKnowledgeSlots(now, "America/Chicago", ["23:00", "23:45"])).toEqual([
      { localDate: "2026-09-28", slot: "23:00" },
      { localDate: "2026-09-28", slot: "23:45" },
    ]);
  });

  it("rejects invalid time zones instead of silently scheduling in UTC", () => {
    expect(() => dueKnowledgeSlots(new Date(), "Mars/Olympus_Mons", ["08:00"])).toThrow();
  });
});
