import type { DependencyGraph, DependencyTreeNode } from "../../shared/types.js";

/** Count nodes with status 'pending' that have all deps met (no unresolved children) */
export function countReadyNodes(graph: DependencyGraph): number {
  let count = 0;
  function walkUp(node: DependencyTreeNode): boolean {
    const allChildrenDone = node.children.every(
      (c) => c.status === "done" || c.status === "failed" || walkUp(c),
    );
    if (node.status === "pending" && allChildrenDone) count++;
    return node.status === "done" || node.status === "failed";
  }
  for (const child of graph.upstream) walkUp(child);
  // Root itself if pending and all upstream done
  const rootAllUpstreamDone = graph.upstream.every(
    (c) => c.status === "done" || c.status === "failed",
  );
  if (graph.status === "pending" && rootAllUpstreamDone) count++;
  return count;
}

export function jsonToolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function errorToolResult(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error ${action}: ${message}`,
      },
    ],
    isError: true,
  };
}
