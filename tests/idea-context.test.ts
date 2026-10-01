import { describe, expect, it } from "vitest";
import { prioritizeIdeaEvidence, prioritizeIdeaProjects } from "../src/lib/ideas";

describe("daily idea project priority", () => {
  it("keeps recently active older projects ahead of newer but inactive projects", () => {
    const selected = prioritizeIdeaProjects([
      { id: "newest", created_at: "2026-10-01T12:00:00Z", activity_at: "2026-10-01T12:00:00Z" },
      { id: "active-old", created_at: "2026-03-01T12:00:00Z", activity_at: "2026-10-02T08:00:00Z" },
      { id: "recent", created_at: "2026-09-30T12:00:00Z", activity_at: "2026-09-30T12:00:00Z" },
    ], 2);

    expect(selected.map((project) => project.id)).toEqual(["active-old", "newest"]);
  });
});

describe("daily idea context priority", () => {
  it("keeps every selected project brief and fills the remaining budget with the newest evidence", () => {
    const briefs = [
      { id: "brief:p1:v1", projectId: "p1", type: "project_brief", text: "Current brief one" },
      { id: "brief:p2:v3", projectId: "p2", type: "project_brief", text: "Current brief two" },
    ];
    const activity = [
      { id: "message:old", projectId: "p1", type: "message", at: "2026-09-01T10:00:00Z" },
      { id: "event:newest", projectId: "p2", type: "progress", at: "2026-10-01T08:30:00Z" },
      { id: "note:middle", projectId: "p1", type: "decision", at: "2026-09-28T12:00:00Z" },
    ];

    const selected = prioritizeIdeaEvidence(briefs, activity, 4);

    expect(selected.slice(0, 2)).toEqual(briefs);
    expect(selected.map((item) => item.id)).toEqual([
      "brief:p1:v1",
      "brief:p2:v3",
      "event:newest",
      "note:middle",
    ]);
  });
});
