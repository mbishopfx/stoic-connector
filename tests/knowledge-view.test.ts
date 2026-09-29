import { describe, expect, it } from "vitest";
import { filterKnowledgeGraph } from "../src/lib/knowledge-view";
import type { KnowledgeGraphIndex } from "../src/lib/knowledge";

const graph: KnowledgeGraphIndex = {
  contract_version: 1,
  project_id: "00000000-0000-4000-8000-000000000001",
  nodes: [
    { id: "decision-alpha", project_id: "00000000-0000-4000-8000-000000000001", kind: "decision", title: "Alpha decision", status: "active", confidence: "verified", updated_at: "2026-09-28T12:00:00Z", source_path: "decisions/alpha.md", source_agent: "agent-alpha", evidence: [], stale: false, orphan: false },
    { id: "question-beta", project_id: "00000000-0000-4000-8000-000000000001", kind: "question", title: "Beta question", status: "proposed", confidence: "uncertain", updated_at: "2026-09-28T12:00:00Z", source_path: "questions/beta.md", source_user: "user-one", evidence: [], stale: false, orphan: false },
    { id: "note-gamma", project_id: "00000000-0000-4000-8000-000000000001", kind: "note", title: "Gamma archived note", status: "archived", confidence: "likely", updated_at: "2026-09-28T12:00:00Z", source_path: "notes/gamma.md", evidence: [], stale: true, orphan: true },
  ],
  edges: [
    { id: "decision-alpha:related:question-beta", source: "decision-alpha", target: "question-beta", type: "related", target_exists: true },
    { id: "decision-alpha:wikilink:missing-note", source: "decision-alpha", target: "missing-note", type: "wikilink", target_exists: false },
  ],
};

describe("knowledge graph view filters", () => {
  it("combines search, agent, and edge filters without showing hidden nodes", () => {
    const view = filterKnowledgeGraph(graph, { query: "alpha", agentId: "agent-alpha", edgeTypes: ["related"] });
    expect(view.nodes.map((node) => node.id)).toEqual(["decision-alpha"]);
    expect(view.edges).toEqual([]);
    expect(view.totalNodes).toBe(3);
  });

  it("shows unresolved links and only notes needing review for that scope", () => {
    const review = filterKnowledgeGraph(graph, { scope: "needs_review" });
    expect(review.nodes.map((node) => node.id)).toEqual(["question-beta"]);
    expect(review.edges).toEqual([]);
    const all = filterKnowledgeGraph(graph, { query: "alpha", edgeTypes: ["wikilink"] });
    expect(all.edges.map((edge) => edge.target)).toEqual(["missing-note"]);
  });

  it("can isolate stale and orphan notes without changing the source graph", () => {
    const stale = filterKnowledgeGraph(graph, { scope: "stale" });
    expect(stale.nodes.map((node) => node.id)).toEqual(["note-gamma"]);
    expect(filterKnowledgeGraph(graph, { scope: "orphan" }).nodes.map((node) => node.id)).toEqual(["note-gamma"]);
    expect(graph.nodes).toHaveLength(3);
  });
});
