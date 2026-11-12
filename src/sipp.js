import { Heap } from "./heap.js";

// Each search state is a cell and a contiguous safe interval. For that pair,
// an earlier arrival dominates all later ones because waiting there is legal.
export function shortest(
  layout,
  robot,
  heuristic,
  constraints,
  horizon,
  stats,
) {
  if (heuristic[robot.start] < 0 || heuristic[robot.start] > horizon)
    return null;
  const vertices = new Map(),
    edges = new Map();
  for (const c of constraints) {
    const map = c.kind === "vertex" ? vertices : edges;
    const key = c.kind === "vertex" ? c.to : c.from + ":" + c.to;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(c.t);
  }
  const cache = new Map();
  function intervals(cell) {
    if (cache.has(cell)) return cache.get(cell);
    const safe = [];
    let start = 0;
    for (const t of [...(vertices.get(cell) ?? [])].sort((a, b) => a - b)) {
      if (t > horizon) break;
      if (start < t) safe.push([start, t - 1]);
      start = t + 1;
    }
    if (start <= horizon) safe.push([start, horizon]);
    cache.set(cell, safe);
    return safe;
  }
  const first = intervals(robot.start)[0];
  if (!first || first[0] !== 0) return null;
  const open = new Heap(
    (a, b) =>
      a.f - b.f < 0 ||
      (a.f === b.f &&
        (a.time > b.time || (a.time === b.time && a.serial < b.serial))),
  );
  const best = new Map();
  let serial = 0;
  function add(cell, span, time, parent) {
    const key = cell + ":" + span[0];
    if ((best.get(key) ?? Infinity) <= time || time + heuristic[cell] > horizon)
      return;
    best.set(key, time);
    open.push({
      key,
      cell,
      span,
      time,
      parent,
      f: time + heuristic[cell],
      serial: serial++,
    });
  }
  add(robot.start, first, 0, null);
  while (open.size) {
    const current = open.pop();
    if (best.get(current.key) !== current.time) continue;
    stats.lowExpanded++;
    if (current.cell === robot.goal && current.span[1] === horizon) {
      const chain = [];
      for (let n = current; n; n = n.parent) chain.push(n);
      chain.reverse();
      const path = [chain[0].cell];
      for (const n of chain.slice(1)) {
        while (path.length < n.time) path.push(path.at(-1));
        path.push(n.cell);
      }
      return path;
    }
    for (const dest of layout.adjacent[current.cell]) {
      const blocked = edges.get(current.cell + ":" + dest);
      for (const span of intervals(dest)) {
        let time = Math.max(current.time + 1, span[0]);
        const last = Math.min(span[1], current.span[1] + 1);
        while (time <= last && blocked?.has(time)) time++;
        if (time <= last) add(dest, span, time, current);
      }
    }
  }
  return null;
}
