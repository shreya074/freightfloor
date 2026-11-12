export function world(data) {
  if (
    !data ||
    !Array.isArray(data.map) ||
    !data.map.length ||
    data.map.length > 100
  )
    throw Error("map must have 1..100 rows");
  const width = data.map[0]?.length,
    height = data.map.length;
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 100 ||
    data.map.some(
      (row) =>
        typeof row !== "string" || row.length !== width || /[^.#]/.test(row),
    )
  ) {
    throw Error(
      "expected a rectangular floor of '.' and '#' cells, up to 100 columns",
    );
  }
  const at = ([x, y]) => y * width + x;
  function validatePoint(p) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isInteger))
      throw Error("invalid coordinates");
    const [x, y] = p;
    if (x < 0 || x >= width || y < 0 || y >= height || data.map[y][x] !== ".")
      throw Error("station must lie on open floor");
    return at(p);
  }
  if (
    !Array.isArray(data.robots) ||
    data.robots.length < 1 ||
    data.robots.length > 32
  )
    throw Error("expected 1..32 robots");
  const names = new Set(),
    starts = new Set(),
    goals = new Set();
  const robots = data.robots.map((r) => {
    if (!r || typeof r.id !== "string" || !r.id.length || names.has(r.id))
      throw Error("robot IDs must be unique");
    const start = validatePoint(r.start),
      goal = validatePoint(r.goal);
    if (starts.has(start) || goals.has(goal))
      throw Error("starts and parked goals must be distinct");
    starts.add(start);
    goals.add(goal);
    names.add(r.id);
    return { id: r.id, start, goal };
  });
  const adjacent = Array.from({ length: width * height }, () => []);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data.map[y][x] !== ".") continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const a = x + dx,
          b = y + dy;
        if (
          a >= 0 &&
          a < width &&
          b >= 0 &&
          b < height &&
          data.map[b][a] === "."
        )
          adjacent[at([x, y])].push(at([a, b]));
      }
    }
  return {
    width,
    height,
    robots,
    adjacent,
    xy: (cell) => [cell % width, Math.floor(cell / width)],
  };
}

export function distances(layout, goal) {
  const d = new Int32Array(layout.adjacent.length).fill(-1);
  const q = [goal];
  d[goal] = 0;
  for (let i = 0; i < q.length; i++)
    for (const n of layout.adjacent[q[i]]) {
      if (d[n] >= 0) continue;
      d[n] = d[q[i]] + 1;
      q.push(n);
    }
  return d;
}

export function position(path, t) {
  return path[Math.min(t, path.length - 1)];
}

export function findConflicts(paths, limit = Infinity) {
  const found = [],
    end = Math.max(...paths.map((p) => p.length));
  for (let t = 0; t < end; t++)
    for (let a = 0; a < paths.length; a++)
      for (let b = a + 1; b < paths.length; b++) {
        const x = position(paths[a], t),
          y = position(paths[b], t);
        if (x === y) found.push({ a, b, t, kind: "vertex", x, y });
        else if (
          t &&
          position(paths[a], t - 1) === y &&
          position(paths[b], t - 1) === x
        )
          found.push({ a, b, t, kind: "edge", x, y });
        if (found.length >= limit) return found;
      }
  return found;
}

export function audit(data, result) {
  const map = world(data);
  if (
    !result ||
    result.status !== "optimal" ||
    !Array.isArray(result.paths) ||
    map.robots.length !== result.paths.length
  )
    throw Error("expected a complete schedule");
  const paths = result.paths.map((p, i) => {
    const r = map.robots[i];
    if (p.id !== r.id || !Array.isArray(p.cells) || !p.cells.length)
      throw Error("missing path");
    const path = p.cells.map((pt) => {
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(Number.isInteger))
        throw Error("invalid path coordinate");
      const [x, y] = pt;
      if (
        x < 0 ||
        x >= map.width ||
        y < 0 ||
        y >= map.height ||
        data.map[y][x] !== "."
      )
        throw Error("path leaves the floor");
      return y * map.width + x;
    });
    if (path[0] !== r.start || path.at(-1) !== r.goal)
      throw Error("incorrect endpoint");
    for (let t = 1; t < path.length; t++)
      if (
        path[t] !== path[t - 1] &&
        !map.adjacent[path[t - 1]].includes(path[t])
      )
        throw Error("nonadjacent move");
    return path;
  });
  // Reconstruct occupancy independently of the CBS conflict selector.
  const makespan = Math.max(...paths.map((p) => p.length - 1));
  for (let t = 0; t <= makespan; t++) {
    const cells = new Set(),
      moves = new Set();
    for (const p of paths) {
      const here = position(p, t),
        prev = position(p, Math.max(0, t - 1));
      if (cells.has(here)) throw Error("two robots occupy a cell");
      if (here !== prev && moves.has(here + ":" + prev))
        throw Error("head-on edge swap");
      cells.add(here);
      moves.add(prev + ":" + here);
    }
  }
  const cost = paths.reduce((sum, p) => sum + p.length - 1, 0);
  if (
    result.cost !== cost ||
    result.makespan !== makespan ||
    !Number.isInteger(result.horizon) ||
    makespan > result.horizon
  )
    throw Error("schedule metrics disagree");
  return { cost, makespan, robots: paths.length };
}
