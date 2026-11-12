import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { solve, audit } from "../src/planner.js";
import { shortest } from "../src/sipp.js";
import { world, distances } from "../src/world.js";

const example = (name) =>
  JSON.parse(
    readFileSync(new URL("../examples/" + name + ".json", import.meta.url)),
  );
function choices(options, visit, chosen = []) {
  if (chosen.length === options.length) {
    visit(chosen);
    return;
  }
  for (const option of options[chosen.length])
    choices(options, visit, [...chosen, option]);
}

// Exhaustively search simultaneous moves. Each robot may permanently park on
// arrival or remain active and leave the goal later. Cost accrues per active robot.
function oracle(data, horizon) {
  const rows = data.map,
    w = rows[0].length,
    encode = ([x, y]) => y * w + x;
  const starts = data.robots.map((r) => encode(r.start)),
    goals = data.robots.map((r) => encode(r.goal));
  const full = (1 << starts.length) - 1;
  const moves = rows
    .join("")
    .split("")
    .map((_, p) => {
      const x = p % w,
        y = Math.floor(p / w);
      return [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dy]) => [x + dx, y + dy])
        .filter(([a, b]) => rows[b]?.[a] === ".")
        .map(encode);
    });
  let active = new Map(),
    best = Infinity;
  function insert(map, pos, mask, cost) {
    let eligible = 0;
    pos.forEach((p, i) => {
      if (p === goals[i] && !(mask & (1 << i))) eligible |= 1 << i;
    });
    for (let subset = eligible; ; subset = (subset - 1) & eligible) {
      const parked = mask | subset,
        key = pos.join(",") + "/" + parked;
      if (parked === full) best = Math.min(best, cost);
      else if (cost < best && (!map.has(key) || map.get(key).cost > cost))
        map.set(key, { pos, mask: parked, cost });
      if (!subset) break;
    }
  }
  insert(active, starts, 0, 0);
  for (let t = 0; t < horizon; t++) {
    const next = new Map();
    for (const { pos, mask, cost } of active.values()) {
      const increment = pos.reduce(
        (sum, _, i) => sum + Number(!(mask & (1 << i))),
        0,
      );
      if (cost + increment >= best) continue;
      choices(
        pos.map((p, i) => (mask & (1 << i) ? [p] : moves[p])),
        (dest) => {
          if (new Set(dest).size !== dest.length) return;
          for (let i = 0; i < pos.length; i++)
            for (let j = 0; j < i; j++)
              if (dest[i] === pos[j] && dest[j] === pos[i]) return;
          insert(next, dest, mask, cost + increment);
        },
      );
    }
    active = next;
  }
  return best;
}

test("three bundled floors have audited optimal schedules", () => {
  for (const [name, cost, makespan] of [
    ["crossdock", 62, 18],
    ["passing-bay", 23, 12],
    ["four-way", 15, 6],
  ]) {
    const data = example(name),
      result = solve(data);
    assert.equal(result.status, "optimal");
    assert.deepEqual(audit(data, result), {
      cost,
      makespan,
      robots: data.robots.length,
    });
    assert.ok(result.stats.initialConflicts > 0);
    assert.equal(
      solve({ ...data, robots: [...data.robots].reverse() }).cost,
      cost,
    );
  }
});

test("safe intervals preserve directed edge bans and future goal reservations", () => {
  const data = {
      map: ["..."],
      robots: [{ id: "a", start: [0, 0], goal: [2, 0] }],
    },
    layout = world(data);
  const r = layout.robots[0],
    h = distances(layout, r.goal);
  const bans = [1, 2].map((t) => ({ kind: "edge", from: 0, to: 1, t }));
  assert.deepEqual(
    shortest(layout, r, h, bans, 5, { lowExpanded: 0 }),
    [0, 0, 0, 1, 2],
  );
  const home = { id: "x", start: 1, goal: 1 },
    stay = shortest(
      layout,
      home,
      distances(layout, 1),
      [{ kind: "vertex", to: 1, t: 2 }],
      4,
      { lowExpanded: 0 },
    );
  assert.equal(stay.at(-1), 1);
  assert.notEqual(stay[2], 1);
  assert.equal(stay.length, 4);
  assert.equal(
    shortest(layout, r, h, [{ kind: "vertex", to: 0, t: 0 }], 5, {
      lowExpanded: 0,
    }),
    null,
  );
});

test("finite horizon and exhausted search budget have distinct outcomes", () => {
  assert.equal(
    solve(example("passing-bay"), { horizon: 9 }).status,
    "infeasible_within_horizon",
  );
  const limited = solve(example("passing-bay"), { maxNodes: 1 });
  assert.equal(limited.status, "node_budget_reached");
  assert.ok(limited.lowerBound <= 23);
  const narrow = {
    map: ["..."],
    robots: [
      { id: "a", start: [0, 0], goal: [2, 0] },
      { id: "b", start: [2, 0], goal: [0, 0] },
    ],
  };
  assert.equal(
    solve(narrow, { horizon: 5 }).status,
    "infeasible_within_horizon",
  );
});

test("a parked robot occupies its goal for the rest of the schedule", () => {
  const data = {
    map: ["...", "..."],
    robots: [
      { id: "a", start: [1, 0], goal: [1, 0] },
      { id: "b", start: [0, 0], goal: [2, 0] },
    ],
  };
  const result = solve(data, { horizon: 5 });
  assert.equal(result.cost, oracle(data, 5));
  audit(data, result);
  assert.throws(
    () =>
      audit(data, {
        ...result,
        paths: [
          { id: "a", cells: [[1, 0]] },
          {
            id: "b",
            cells: [
              [0, 0],
              [1, 0],
              [2, 0],
            ],
          },
        ],
      }),
    /occupy/,
  );
});

test("audit rejects edge swaps, wall crossings and incorrect metrics", () => {
  const data = {
    map: ["..", ".."],
    robots: [
      { id: "a", start: [0, 0], goal: [1, 0] },
      { id: "b", start: [1, 0], goal: [0, 0] },
    ],
  };
  const result = solve(data);
  assert.throws(
    () =>
      audit(data, {
        ...result,
        paths: data.robots.map((r) => ({ id: r.id, cells: [r.start, r.goal] })),
      }),
    /swap/,
  );
  assert.throws(() => audit(data, { ...result, cost: 0 }), /metrics/);
  const damaged = structuredClone(result);
  damaged.paths[0].cells.splice(1, 0, [20, -1]);
  assert.throws(() => audit(data, damaged), /leaves/);
});

test("96 seeded two- and three-robot cases agree with joint-state dynamic programming", () => {
  let state = 1937;
  function rand(n) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % n;
  }
  let solved = 0,
    impossible = 0;
  for (let trial = 0; trial < 96; trial++) {
    const w = 3,
      h = trial < 72 ? 3 : 2,
      k = trial < 72 ? 2 : 3;
    const cells = Array.from({ length: w * h }, (_, i) => i);
    const wall = trial % 4 === 0 ? rand(cells.length) : -1;
    const open = cells.filter((p) => p !== wall);
    function sample() {
      const pool = open.slice();
      return Array.from(
        { length: k },
        () => pool.splice(rand(pool.length), 1)[0],
      );
    }
    const starts = sample(),
      goals = sample(),
      pt = (p) => [p % w, Math.floor(p / w)];
    const data = {
      map: Array.from({ length: h }, (_, y) =>
        cells
          .slice(y * w, y * w + w)
          .map((p) => (p === wall ? "#" : "."))
          .join(""),
      ),
      robots: starts.map((s, i) => ({
        id: String(i),
        start: pt(s),
        goal: pt(goals[i]),
      })),
    };
    const horizon = (trial % 5) + 2;
    const expected = oracle(data, horizon),
      actual = solve(data, { horizon, maxNodes: 30000 });
    if (expected === Infinity) {
      impossible++;
      assert.equal(
        actual.status,
        "infeasible_within_horizon",
        "trial " + trial,
      );
    } else {
      solved++;
      assert.equal(actual.status, "optimal", "trial " + trial);
      assert.equal(audit(data, actual).cost, expected, "trial " + trial);
    }
  }
  assert.ok(solved > 10 && impossible > 5);
});

test("public CLI round-trips a plan into the independent replay audit", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "freight-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const input = fileURLToPath(
    new URL("../examples/passing-bay.json", import.meta.url),
  );
  const file = join(dir, "plan.json");
  writeFileSync(
    file,
    execFileSync(process.execPath, [cli, input, "--horizon", "20"]),
  );
  assert.deepEqual(
    JSON.parse(execFileSync(process.execPath, [cli, input, "--audit", file])),
    { cost: 23, makespan: 12, robots: 2 },
  );
});

test("rejects invalid stations and accepts already parked robots at horizon zero", () => {
  assert.throws(
    () =>
      solve({
        map: ["#."],
        robots: [{ id: "x", start: [0, 0], goal: [1, 0] }],
      }),
    /open floor/,
  );
  const d = {
    map: [".."],
    robots: [
      { id: "a", start: [0, 0], goal: [0, 0] },
      { id: "b", start: [1, 0], goal: [1, 0] },
    ],
  };
  assert.deepEqual(audit(d, solve(d, { horizon: 0 })), {
    cost: 0,
    makespan: 0,
    robots: 2,
  });
});
