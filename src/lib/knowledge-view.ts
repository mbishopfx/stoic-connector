import type { KnowledgeGraphEdgeType, KnowledgeGraphIndex, KnowledgeGraphNode, KnowledgeKind } from "./knowledge";

export type KnowledgeGraphScope = "all" | "needs_review" | "stale" | "orphan";

export type KnowledgeGraphViewFilters = {
  query?: string;
  scope?: KnowledgeGraphScope;
  kind?: KnowledgeKind | "all";
  agentId?: string | "all";
  edgeTypes?: readonly KnowledgeGraphEdgeType[];
};

export type KnowledgeGraphView = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphIndex["edges"];
  totalNodes: number;
};

export function filterKnowledgeGraph(
  graph: KnowledgeGraphIndex,
  filters: KnowledgeGraphViewFilters = {},
): KnowledgeGraphView {
  const query = filters.query?.trim().toLocaleLowerCase() || "";
  const edgeTypes = new Set(filters.edgeTypes || ["supersedes", "related", "wikilink"]);
  const nodes = graph.nodes.filter((node) => {
    if (query && !`${node.title} ${node.id} ${node.source_path}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.kind && filters.kind !== "all" && node.kind !== filters.kind) return false;
    if (filters.agentId && filters.agentId !== "all" && node.source_agent !== filters.agentId) return false;
    if (filters.scope === "needs_review" && !["proposed", "conflicted"].includes(node.status)) return false;
    if (filters.scope === "stale" && !node.stale) return false;
    if (filters.scope === "orphan" && !node.orphan) return false;
    return true;
  });
  const visible = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => edgeTypes.has(edge.type)
    && visible.has(edge.source)
    && (!edge.target_exists || visible.has(edge.target)));
  return { nodes, edges, totalNodes: graph.nodes.length };
}
