"use client";

import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

type EntityType =
  | "skill"
  | "technology"
  | "language"
  | "spoken_language"
  | "framework"
  | "tool"
  | "platform"
  | "industry"
  | "methodology"
  | "soft_skill"
  | "certification";

type NodeType = "job" | EntityType;

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface MatchedJob {
  id: string;
  label: string;
}

interface SelectionState {
  items: { label: string; type: string }[];
  matchCount: number;
  jobList: MatchedJob[];
}

const TYPE_COLORS: Record<NodeType, string> = {
  job: "#003dff",
  skill: "#00b341",
  technology: "#0036db",
  language: "#fe9a00",
  framework: "#5583ff",
  tool: "#6f767e",
  platform: "#f0153c",
  industry: "#ff6900",
  methodology: "#009a30",
  soft_skill: "#ffdf00",
  spoken_language: "#a855f7",
  certification: "#14b8a6",
};

const SEGMENT_ORDER: EntityType[] = [
  "skill", "technology", "language", "spoken_language", "framework", "tool",
  "platform", "methodology", "soft_skill", "industry", "certification",
];

const EDGE_DEFAULT_COLOR = "rgba(51,65,85,0.06)";
const EDGE_HIGHLIGHT_COLOR = "rgba(0,61,255,0.7)";
const NODE_DIM_OPACITY = 0.15;
const EMPTY_SELECTION: SelectionState = { items: [], matchCount: 0, jobList: [] };

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) {
    const match = hex.match(/(\d+)/g);
    if (match) return { r: parseInt(match[0]!, 10), g: parseInt(match[1]!, 10), b: parseInt(match[2]!, 10) };
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1]!, 16), g: parseInt(result[2]!, 16), b: parseInt(result[3]!, 16) }
    : { r: 102, g: 102, b: 102 };
}

const DIM_COLOR_CACHE = new Map<string, string>();

function dimColor(hex: string): string {
  let cached = DIM_COLOR_CACHE.get(hex);
  if (cached) return cached;
  const rgb = hexToRgb(hex);
  cached = `rgba(${rgb.r},${rgb.g},${rgb.b},${NODE_DIM_OPACITY})`;
  DIM_COLOR_CACHE.set(hex, cached);
  return cached;
}

interface HighlightState {
  matchingJobs: Set<string>;
  relatedEntities: Set<string>;
  visible: Set<string>;
}

function computeHighlightState(
  graph: Graph,
  selectedNodes: Set<string>,
): HighlightState {
  const empty: HighlightState = {
    matchingJobs: new Set(),
    relatedEntities: new Set(),
    visible: new Set(),
  };

  if (selectedNodes.size === 0) return empty;

  const selectedEntities = new Set<string>();
  const selectedJobs = new Set<string>();
  for (const sel of selectedNodes) {
    if (graph.getNodeAttribute(sel, "nodeType") === "job") {
      selectedJobs.add(sel);
    } else {
      selectedEntities.add(sel);
    }
  }

  const neighborSets = [...selectedEntities].map(
    (sel) => new Set(graph.neighbors(sel)),
  );

  let matchingJobs: Set<string>;

  if (selectedJobs.size > 0 && selectedEntities.size === 0) {
    matchingJobs = new Set(selectedJobs);
  } else if (selectedEntities.size > 0 && selectedJobs.size === 0) {
    matchingJobs = new Set<string>();
    if (neighborSets.length > 0) {
      for (const candidate of neighborSets[0]!) {
        if (
          graph.getNodeAttribute(candidate, "nodeType") === "job" &&
          neighborSets.every((s) => s.has(candidate))
        ) {
          matchingJobs.add(candidate);
        }
      }
    }
  } else {
    matchingJobs = new Set<string>();
    for (const jobId of selectedJobs) {
      if (neighborSets.every((s) => s.has(jobId))) {
        matchingJobs.add(jobId);
      }
    }
  }

  const relatedEntities = new Set<string>();
  if (selectedJobs.size > 0 && selectedEntities.size === 0 && matchingJobs.size > 1) {
    const jobArray = [...matchingJobs];
    const jobNeighborSets = new Map<string, Set<string>>();
    for (const j of jobArray) {
      jobNeighborSets.set(j, new Set(graph.neighbors(j)));
    }
    const firstJobNeighbors = jobNeighborSets.get(jobArray[0]!)!;
    for (const neighbor of firstJobNeighbors) {
      if (graph.getNodeAttribute(neighbor, "nodeType") !== "job") {
        if (jobArray.every((j) => jobNeighborSets.get(j)!.has(neighbor))) {
          relatedEntities.add(neighbor);
        }
      }
    }
  } else {
    for (const job of matchingJobs) {
      for (const neighbor of graph.neighbors(job)) {
        if (graph.getNodeAttribute(neighbor, "nodeType") !== "job") {
          relatedEntities.add(neighbor);
        }
      }
    }
  }

  return {
    matchingJobs,
    relatedEntities,
    visible: new Set([...selectedNodes, ...matchingJobs, ...relatedEntities]),
  };
}

function applyHighlight(
  graph: Graph,
  selectedNodes: Set<string>,
  lockedNodes: Set<string>,
  state: HighlightState,
): void {
  const { matchingJobs, visible } = state;

  if (selectedNodes.size === 0) {
    graph.forEachNode((n, attrs) => {
      graph.mergeNodeAttributes(n, {
        color: attrs.originalColor,
        label: attrs.nodeType === "job" ? "" : attrs.originalLabel,
        forceLabel: false,
        highlighted: false,
        zIndex: 0,
      });
    });
    graph.forEachEdge((e) => {
      graph.mergeEdgeAttributes(e, {
        color: EDGE_DEFAULT_COLOR,
        size: 0.4,
        zIndex: 0,
      });
    });
    return;
  }

  graph.forEachNode((n, a) => {
    const isSelected = selectedNodes.has(n);
    const isMatchingJob = matchingJobs.has(n);
    const isRelated = state.relatedEntities.has(n);

    if (isSelected) {
      graph.mergeNodeAttributes(n, {
        color: a.originalColor,
        zIndex: 2,
        label: a.originalLabel,
        forceLabel: true,
        highlighted: lockedNodes.has(n),
      });
    } else if (isMatchingJob) {
      graph.mergeNodeAttributes(n, {
        color: a.originalColor,
        zIndex: 1,
        label: a.originalLabel,
        forceLabel: true,
        highlighted: false,
      });
    } else if (isRelated) {
      graph.mergeNodeAttributes(n, {
        color: a.originalColor,
        zIndex: 1,
        label: a.originalLabel,
        forceLabel: false,
        highlighted: false,
      });
    } else {
      graph.mergeNodeAttributes(n, {
        color: dimColor(a.originalColor as string),
        zIndex: 0,
        label: a.nodeType === "job" ? "" : a.originalLabel,
        forceLabel: false,
        highlighted: false,
      });
    }
  });

  graph.forEachEdge((e, _a, src, tgt) => {
    const srcVisible = visible.has(src);
    const tgtVisible = visible.has(tgt);
    const involvesMatchingJob = matchingJobs.has(src) || matchingJobs.has(tgt);

    if (srcVisible && tgtVisible && involvesMatchingJob) {
      const involvesSelected = selectedNodes.has(src) || selectedNodes.has(tgt);
      graph.mergeEdgeAttributes(e, {
        color: involvesSelected ? EDGE_HIGHLIGHT_COLOR : "rgba(0,61,255,0.2)",
        size: involvesSelected ? 1.5 : 0.6,
        zIndex: involvesSelected ? 1 : 0,
      });
    } else {
      graph.mergeEdgeAttributes(e, {
        color: "rgba(0,0,0,0)",
        size: 0,
        zIndex: 0,
      });
    }
  });
}

function buildJobList(graph: Graph, matchingJobs: Set<string>): MatchedJob[] {
  return [...matchingJobs].map((id) => ({
    id,
    label: graph.getNodeAttribute(id, "originalLabel") as string,
  }));
}

function BuildGraph({ data }: { data: GraphData }) {
  const loadGraph = useLoadGraph();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const graph = new Graph();
    const jobs = data.nodes.filter((n) => n.type === "job");
    const entities = data.nodes.filter((n) => n.type !== "job");

    const grouped: Record<string, GraphNode[]> = {};
    for (const e of entities) {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type]!.push(e);
    }
    for (const type of Object.keys(grouped)) {
      grouped[type]!.sort((a, b) => b.size - a.size);
    }

    const activeSegments = SEGMENT_ORDER.filter((t) => grouped[t]?.length);
    const segmentAngle = (Math.PI * 2) / activeSegments.length;
    const RING_RADIUS = 500;
    const JOB_RADIUS = 200;

    for (let si = 0; si < activeSegments.length; si++) {
      const type = activeSegments[si]!;
      const items = grouped[type]!;
      const baseAngle = si * segmentAngle;
      const angleSpread = segmentAngle * 0.8;
      const startAngle = baseAngle + (segmentAngle - angleSpread) / 2;

      for (let i = 0; i < items.length; i++) {
        const node = items[i]!;
        const t = items.length === 1 ? 0.5 : i / (items.length - 1);
        const angle = startAngle + t * angleSpread;
        const radiusJitter = RING_RADIUS + (Math.random() - 0.5) * 80;
        const nodeSize = Math.min(Math.sqrt(node.size) * 3 + 4, 22);

        graph.addNode(node.id, {
          label: node.label,
          size: nodeSize,
          color: TYPE_COLORS[node.type] ?? "#6f767e",
          x: Math.cos(angle) * radiusJitter,
          y: Math.sin(angle) * radiusJitter,
          nodeType: node.type,
          originalColor: TYPE_COLORS[node.type] ?? "#6f767e",
          originalLabel: node.label,
        });
      }
    }

    for (let i = 0; i < jobs.length; i++) {
      const node = jobs[i]!;
      const angle = (i / jobs.length) * Math.PI * 2;
      const r = Math.random() * JOB_RADIUS;

      graph.addNode(node.id, {
        label: "",
        size: 5,
        color: TYPE_COLORS.job,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        nodeType: "job",
        originalColor: TYPE_COLORS.job,
        originalLabel: node.label,
      });
    }

    for (const edge of data.edges) {
      if (!graph.hasEdge(edge.source, edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          size: 0.4,
          color: EDGE_DEFAULT_COLOR,
        });
      }
    }

    loadGraph(graph);
  }, [data, loadGraph]);

  return null;
}

function FilterHandler({ activeTypes }: { activeTypes: Set<string> }) {
  const sigma = useSigma();

  useEffect(() => {
    const graph = sigma.getGraph();
    if (graph.order === 0) return;

    graph.forEachNode((n, attrs) => {
      const nodeType = attrs.nodeType as string;
      graph.setNodeAttribute(n, "hidden", nodeType !== "job" && !activeTypes.has(nodeType));
    });

    sigma.refresh();
  }, [sigma, activeTypes]);

  return null;
}

function InteractionHandler({
  onSelectionChange,
}: {
  onSelectionChange: (selection: SelectionState) => void;
}) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<Set<string>>(new Set());
  const dragState = useRef<{ node: string; isDragging: boolean } | null>(null);

  useEffect(() => {
    const graph = sigma.getGraph();

    registerEvents({
      enterNode: (event) => {
        if (dragState.current?.isDragging) return;

        const combined = new Set(selectedRef.current);
        combined.add(event.node);
        const state = computeHighlightState(graph, combined);
        applyHighlight(graph, combined, selectedRef.current, state);

        const attrs = graph.getNodeAttributes(event.node);
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const nodeType = (attrs.nodeType as string) ?? "";
          const color = TYPE_COLORS[nodeType as NodeType] ?? "#6f767e";
          const isJob = nodeType === "job";
          const entityCount = isJob ? graph.neighbors(event.node).length : 0;
          tooltip.innerHTML = `
            <strong>${attrs.originalLabel}</strong>
            <span style="margin-left:8px;color:${color};font-size:11px;background:${color}22;padding:2px 6px;border-radius:6px">${nodeType.replace("_", " ")}</span>
            <div style="margin-top:4px;font-size:11px;color:#9a9fa5">${
              isJob
                ? `${entityCount} connected entities`
                : `${state.matchingJobs.size} matching jobs`
            }</div>
          `;
          tooltip.style.display = "block";
        }
        sigma.refresh();
      },

      leaveNode: () => {
        const state = computeHighlightState(graph, selectedRef.current);
        applyHighlight(graph, selectedRef.current, selectedRef.current, state);
        sigma.refresh();

        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = "none";
      },

      clickNode: (event) => {
        if (dragState.current?.isDragging) return;

        const sel = selectedRef.current;
        if (sel.has(event.node)) {
          sel.delete(event.node);
        } else {
          sel.add(event.node);
        }

        const state = computeHighlightState(graph, sel);
        applyHighlight(graph, sel, sel, state);

        const items = [...sel].map((n) => ({
          label: graph.getNodeAttribute(n, "originalLabel") as string,
          type: graph.getNodeAttribute(n, "nodeType") as string,
        }));
        onSelectionChange({
          items,
          matchCount: state.matchingJobs.size,
          jobList: buildJobList(graph, state.matchingJobs),
        });
        sigma.refresh();
      },

      clickStage: () => {
        selectedRef.current.clear();
        const state = computeHighlightState(graph, selectedRef.current);
        applyHighlight(graph, selectedRef.current, selectedRef.current, state);
        onSelectionChange(EMPTY_SELECTION);
        sigma.refresh();
      },

      mousemovebody: (event) => {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const e = event.original as MouseEvent;
          tooltip.style.left = `${e.clientX + 14}px`;
          tooltip.style.top = `${e.clientY + 14}px`;
        }
      },

      downNode: (event) => {
        dragState.current = { node: event.node, isDragging: false };
        sigma.getCamera().disable();
      },

      mousemove: (event) => {
        if (!dragState.current) return;
        dragState.current.isDragging = true;
        const pos = sigma.viewportToGraph(event);
        graph.setNodeAttribute(dragState.current.node, "x", pos.x);
        graph.setNodeAttribute(dragState.current.node, "y", pos.y);
      },

      mouseup: () => {
        if (dragState.current) {
          sigma.getCamera().enable();
          dragState.current = null;
        }
      },
    });
  }, [sigma, registerEvents, onSelectionChange]);

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 hidden pointer-events-none max-w-[400px] rounded-[6px] border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 shadow-lg"
    />
  );
}

export default function GraphViewer() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(Object.keys(TYPE_COLORS)),
  );
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const handleSelectionChange = useCallback(
    (next: SelectionState) => {
      setSelection((prev) => {
        if (
          prev.matchCount === next.matchCount &&
          prev.items.length === next.items.length &&
          prev.jobList.length === next.jobList.length
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const stats = useMemo(() => {
    if (!data) return {};
    const s: Record<string, number> = {};
    for (const n of data.nodes) s[n.type] = (s[n.type] ?? 0) + 1;
    return s;
  }, [data]);

  const filteredCounts = useMemo(() => {
    if (!data) return { nodes: 0, edges: 0 };
    const visibleNodes = new Set(
      data.nodes.filter((n) => activeTypes.has(n.type)).map((n) => n.id),
    );
    return {
      nodes: visibleNodes.size,
      edges: data.edges.filter(
        (e) => visibleNodes.has(e.source) && visibleNodes.has(e.target),
      ).length,
    };
  }, [data, activeTypes]);

  if (loading || !data)
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 font-sans text-neutral-500">
        Loading knowledge graph...
      </div>
    );

  return (
    <div className="relative h-screen w-full bg-neutral-50">
      <SigmaContainer
        style={{ height: "100vh", width: "100%" }}
        settings={{
          defaultEdgeColor: EDGE_DEFAULT_COLOR,
          defaultNodeColor: "#6f767e",
          labelColor: { color: "#33383f" },
          labelRenderedSizeThreshold: 8,
          labelFont: "system-ui, -apple-system, sans-serif",
          labelWeight: "500",
          renderEdgeLabels: false,
          enableEdgeEvents: false,
          zIndex: true,
        }}
      >
        <BuildGraph data={data} />
        <FilterHandler activeTypes={activeTypes} />
        <InteractionHandler onSelectionChange={handleSelectionChange} />
      </SigmaContainer>

      {selection.jobList.length > 0 && (
        <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 w-[520px] max-h-[70vh] rounded-lg border border-neutral-200 bg-white/95 shadow-xl backdrop-blur-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
            <div className="flex flex-wrap gap-1.5 flex-1">
              {selection.items.map((item) => {
                const color = TYPE_COLORS[item.type as NodeType] ?? "#6f767e";
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: `${color}15`,
                      color,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {item.label}
                  </span>
                );
              })}
            </div>
            <span className="text-sm font-bold text-neutral-900 whitespace-nowrap">
              {selection.matchCount} jobs
            </span>
          </div>
          <div className="overflow-y-auto divide-y divide-neutral-50">
            {selection.jobList.map((job) => (
              <div key={job.id} className="px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                {job.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-10 min-w-[180px] rounded-lg border border-neutral-200 bg-white/95 p-4 text-sm text-neutral-900 shadow-lg backdrop-blur-sm">
        <div className="mb-3 text-sm font-bold">Filter</div>
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const count = stats[type] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={type}
              onClick={() => {
                setActiveTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                });
              }}
              className="flex cursor-pointer items-center gap-2 py-1 transition-opacity"
              style={{ opacity: activeTypes.has(type) ? 1 : 0.25 }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <span className="flex-1 text-neutral-600">{type.replace("_", " ")}</span>
              <span className="text-[11px] text-neutral-400">{count}</span>
            </div>
          );
        })}
        <div className="mt-3 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-400">
          Click entity to lock<br />
          Multi-lock for AND filter<br />
          Click background to clear<br />
          Drag nodes to move
        </div>
      </div>

      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-xl font-bold text-neutral-900">
          StartupJobs Knowledge Graph
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          {filteredCounts.nodes} nodes &middot;{" "}
          {filteredCounts.edges} edges
        </p>
      </div>
    </div>
  );
}
