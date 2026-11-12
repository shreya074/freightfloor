import { Heap } from "./heap.js";
import { distances, findConflicts, world } from "./world.js";
import { shortest } from "./sipp.js";
export { audit } from "./world.js";

function rule(conflict, robot) {
  if (conflict.kind === "vertex")
    return { kind: "vertex", to: conflict.x, t: conflict.t };
  const forward = robot === conflict.a;
  return {
    kind: "edge",
    from: forward ? conflict.y : conflict.x,
    to: forward ? conflict.x : conflict.y,
    t: conflict.t,
  };
}
const encode = (c) => [c.t, c.kind, c.from ?? -1, c.to].join("/");
const cost = (paths) => paths.reduce((sum, p) => sum + p.length - 1, 0);

export function solve(data, options = {}) {
  const layout = world(data),
    robots = layout.robots;
  const horizon = options.horizon ?? 64,
    limit = options.maxNodes ?? 15000;
  if (
    !Number.isInteger(horizon) ||
    horizon < 0 ||
    horizon > 2048 ||
    !Number.isInteger(limit) ||
    limit < 1
  )
    throw Error("invalid horizon or node budget");
  const stats = {
    highExpanded: 0,
    lowExpanded: 0,
    lowSearches: 0,
    cacheHits: 0,
    frontierPeak: 0,
    initialConflicts: 0,
  };
  const metrics = { horizon, stats };
  const h = robots.map((r) => distances(layout, r.goal));
  const cache = robots.map(() => new Map());
  function pathFor(i, constraints) {
    const key = constraints.map(encode).join(";");
    if (cache[i].has(key)) {
      stats.cacheHits++;
      return cache[i].get(key);
    }
    stats.lowSearches++;
    const path = shortest(layout, robots[i], h[i], constraints, horizon, stats);
    cache[i].set(key, path);
    return path;
  }
  const open = new Heap((a, b) =>
    a.cost !== b.cost
      ? a.cost < b.cost
      : a.collisions !== b.collisions
        ? a.collisions < b.collisions
        : a.serial < b.serial,
  );
  const seen = new Set();
  let serial = 0;
  function push(paths, constraints) {
    const key = constraints.map((c) => c.map(encode).join(";")).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const conflicts = findConflicts(paths);
    open.push({
      paths,
      constraints,
      cost: cost(paths),
      collisions: conflicts.length,
      conflicts,
      serial: serial++,
    });
    stats.frontierPeak = Math.max(stats.frontierPeak, open.size);
  }
  const initial = robots.map((_, i) => pathFor(i, []));
  if (initial.some((p) => p === null))
    return { status: "infeasible_within_horizon", ...metrics };
  stats.initialConflicts = findConflicts(initial).length;
  push(
    initial,
    robots.map(() => []),
  );
  while (open.size) {
    const node = open.pop();
    if (!node.collisions)
      return {
        status: "optimal",
        ...metrics,
        cost: node.cost,
        makespan: Math.max(...node.paths.map((p) => p.length - 1)),
        paths: node.paths.map((p, i) => ({
          id: robots[i].id,
          cells: p.map(layout.xy),
        })),
      };
    if (stats.highExpanded >= limit)
      return {
        status: "node_budget_reached",
        lowerBound: node.cost,
        ...metrics,
      };
    stats.highExpanded++;
    // Probe a bounded set of conflicts. Prefer one that increases both branches'
    // lower bounds. Both disjuncts are retained, regardless of the heuristic.
    let selected = null,
      rank = -1;
    for (const conflict of node.conflicts.slice(0, 4)) {
      const branches = [conflict.a, conflict.b].map((i) => {
        const added = rule(conflict, i);
        const rules = [...node.constraints[i], added].sort(
          (a, b) => a.t - b.t || (encode(a) < encode(b) ? -1 : 1),
        );
        return { i, rules, path: pathFor(i, rules) };
      });
      const score = branches.filter(
        (b) => !b.path || b.path.length > node.paths[b.i].length,
      ).length;
      if (score > rank) {
        selected = branches;
        rank = score;
      }
      if (rank === 2) break;
    }
    for (const b of selected) {
      if (!b.path) continue;
      const paths = node.paths.slice(),
        constraints = node.constraints.slice();
      paths[b.i] = b.path;
      constraints[b.i] = b.rules;
      push(paths, constraints);
    }
  }
  return { status: "infeasible_within_horizon", ...metrics };
}
