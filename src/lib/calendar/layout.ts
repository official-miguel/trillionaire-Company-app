import type { Occurrence } from "./types";

export interface Placed {
  occ: Occurrence;
  /** Column within its group of overlapping events, and how many columns. */
  col: number;
  cols: number;
}

/**
 * Places a day's timed events side by side where they overlap, like a paper
 * diary: each cluster of overlapping events shares the width equally.
 */
export function placeDay(items: Occurrence[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = 0;
  const colEnds: number[] = [];

  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    for (const p of cluster) p.cols = cols;
    placed.push(...cluster);
    cluster = [];
    colEnds.length = 0;
  };

  for (const occ of sorted) {
    const s = occ.start.getTime();
    const e = Math.max(occ.end.getTime(), s + 15 * 60_000);
    if (cluster.length && s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) col = colEnds.length;
    colEnds[col] = e;
    cluster.push({ occ, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}
