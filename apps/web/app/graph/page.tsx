"use client";

import dynamic from "next/dynamic";

const GraphViewer = dynamic(() => import("./graph-viewer"), { ssr: false });

export default function GraphPage() {
  return <GraphViewer />;
}
