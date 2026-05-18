import "./env.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const __dirname = dirname(fileURLToPath(import.meta.url));

import { sql } from "drizzle-orm";
import { createDb } from "../db/connection.js";

const db = createDb();

const entityRows = await db.execute(sql`
  SELECT e.id, e.name, e.type, COUNT(DISTINCT je.job_id) as job_count
  FROM entities e
  JOIN job_entities je ON je.entity_id = e.id
  GROUP BY e.id, e.name, e.type
  HAVING COUNT(DISTINCT je.job_id) >= 2
  ORDER BY job_count DESC
  LIMIT 150
`);

const jobRows = await db.execute(sql`
  SELECT jl.id, jl.title, jl.company, jl.detected_language, jl.is_remote
  FROM job_listings jl
  WHERE jl.extracted_at IS NOT NULL
  LIMIT 100
`);

const linkRows = await db.execute(sql`
  SELECT je.job_id, je.entity_id, je.relation
  FROM job_entities je
  WHERE je.entity_id IN (
    SELECT e.id FROM entities e
    JOIN job_entities je2 ON je2.entity_id = e.id
    GROUP BY e.id HAVING COUNT(DISTINCT je2.job_id) >= 2
  )
  AND je.job_id IN (
    SELECT id FROM job_listings WHERE extracted_at IS NOT NULL LIMIT 100
  )
`);

interface Node {
  id: string;
  label: string;
  type: string;
  size: number;
}

interface Link {
  source: string;
  target: string;
  relation: string;
}

const nodes: Node[] = [];
const links: Link[] = [];
const nodeIds = new Set<string>();

for (const row of entityRows.rows as Array<Record<string, unknown>>) {
  const id = `e-${row["id"]}`;
  nodes.push({
    id,
    label: row["name"] as string,
    type: row["type"] as string,
    size: Number(row["job_count"]),
  });
  nodeIds.add(id);
}

for (const row of jobRows.rows as Array<Record<string, unknown>>) {
  const id = `j-${row["id"]}`;
  nodes.push({
    id,
    label: `${row["title"]} @ ${row["company"]}`,
    type: "job",
    size: 3,
  });
  nodeIds.add(id);
}

for (const row of linkRows.rows as Array<Record<string, unknown>>) {
  const source = `j-${row["job_id"]}`;
  const target = `e-${row["entity_id"]}`;
  if (nodeIds.has(source) && nodeIds.has(target)) {
    links.push({
      source,
      target,
      relation: row["relation"] as string,
    });
  }
}

const typeColors: Record<string, string> = {
  job: "#4f46e5",
  skill: "#059669",
  technology: "#0891b2",
  language: "#d97706",
  framework: "#7c3aed",
  tool: "#64748b",
  platform: "#dc2626",
  industry: "#be185d",
  methodology: "#0d9488",
  soft_skill: "#f59e0b",
};

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>StartupJobs Knowledge Graph</title>
  <style>
    body { margin: 0; background: #0f172a; overflow: hidden; font-family: system-ui; }
    svg { width: 100vw; height: 100vh; }
    .legend { position: fixed; top: 16px; right: 16px; background: #1e293b; padding: 16px; border-radius: 8px; color: #e2e8f0; font-size: 13px; }
    .legend div { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    .legend span { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .stats { position: fixed; bottom: 16px; left: 16px; color: #94a3b8; font-size: 12px; }
    .tooltip { position: fixed; background: #1e293b; color: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; display: none; border: 1px solid #334155; max-width: 300px; }
  </style>
</head>
<body>
  <div class="legend">
    <strong>Entity Types</strong>
    ${Object.entries(typeColors)
      .map(([t, c]) => `<div><span style="background:${c}"></span>${t}</div>`)
      .join("")}
  </div>
  <div class="stats">${nodes.length} nodes, ${links.length} edges</div>
  <div class="tooltip" id="tooltip"></div>
  <svg id="graph"></svg>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
    const data = ${JSON.stringify({ nodes, links })};
    const colors = ${JSON.stringify(typeColors)};
    const width = window.innerWidth, height = window.innerHeight;
    const svg = d3.select('#graph');
    const g = svg.append('g');
    const tooltip = document.getElementById('tooltip');

    svg.call(d3.zoom().on('zoom', e => g.attr('transform', e.transform)));

    const sim = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width/2, height/2))
      .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.size) * 4 + 8));

    const link = g.append('g').selectAll('line').data(data.links).join('line')
      .attr('stroke', '#334155').attr('stroke-width', 0.5).attr('stroke-opacity', 0.4);

    const node = g.append('g').selectAll('circle').data(data.nodes).join('circle')
      .attr('r', d => d.type === 'job' ? 5 : Math.sqrt(d.size) * 3 + 3)
      .attr('fill', d => colors[d.type] || '#666')
      .attr('stroke', '#0f172a').attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .call(d3.drag().on('start', (e,d) => { if(!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
        .on('drag', (e,d) => { d.fx=e.x; d.fy=e.y; })
        .on('end', (e,d) => { if(!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }))
      .on('mouseover', (e,d) => {
        tooltip.style.display = 'block';
        tooltip.innerHTML = '<strong>' + d.label + '</strong><br>Type: ' + d.type + (d.size > 1 ? '<br>Connections: ' + d.size : '');
      })
      .on('mousemove', e => { tooltip.style.left = (e.clientX+12)+'px'; tooltip.style.top = (e.clientY+12)+'px'; })
      .on('mouseout', () => { tooltip.style.display = 'none'; });

    const label = g.append('g').selectAll('text').data(data.nodes.filter(d => d.type !== 'job' && d.size >= 5)).join('text')
      .text(d => d.label).attr('fill', '#94a3b8').attr('font-size', 10)
      .attr('dx', 10).attr('dy', 3).attr('pointer-events', 'none');

    sim.on('tick', () => {
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      node.attr('cx',d=>d.x).attr('cy',d=>d.y);
      label.attr('x',d=>d.x).attr('y',d=>d.y);
    });
  </script>
</body>
</html>`;

const outPath = resolve(__dirname, "../../kb-graph.html");
writeFileSync(outPath, html);
console.log(`Knowledge graph written to ${outPath}`);
console.log(`${nodes.length} nodes, ${links.length} edges`);
console.log(`Open in Chrome: file://${outPath}`);

process.exit(0);
