import { draw, colors } from "./draw.js";
const get = (id) => document.getElementById(id);
const canvas = get("floor");
let data = null,
  result = null,
  worker = null,
  version = 0,
  clock = 0,
  playing = false,
  active = null,
  edit = false,
  backup = null,
  cursor = [0, 0],
  geometry = null,
  last = 0,
  frame = 0;

function paint() {
  geometry = draw(
    canvas,
    data,
    result,
    clock,
    active,
    get("trails").checked,
    edit,
    cursor,
  );
  get("timeline").value = Math.floor(clock);
  get("readout").textContent =
    Math.floor(clock) + " / " + (result?.makespan ?? 0) + " ticks";
}
function controls() {
  const ready = result?.status === "optimal" && !edit;
  for (const id of ["play", "step", "rewind", "timeline"])
    get(id).disabled = !ready;
  get("play").textContent = playing ? "Ⅱ Pause" : "▶ Play";
  get("timeline").max = result?.makespan ?? 0;
  get("edit").textContent = edit ? "Apply & replan" : "Edit floor";
  get("edit").disabled = !data;
  get("edit").setAttribute("aria-pressed", String(edit));
  get("cancel").hidden = !edit;
}
function pause() {
  playing = false;
  cancelAnimationFrame(frame);
  controls();
}
function animate(now) {
  if (!playing) return;
  if (last)
    clock = Math.min(
      result.makespan,
      clock + (now - last) * 0.0025 * Number(get("speed").value),
    );
  last = now;
  paint();
  if (clock >= result.makespan) {
    pause();
    return;
  }
  frame = requestAnimationFrame(animate);
}
function roster() {
  const el = get("robots");
  el.replaceChildren();
  for (const [i, r] of (data?.robots ?? []).entries()) {
    const button = document.createElement("button");
    button.className = "robot";
    button.setAttribute("aria-label", "Highlight robot " + r.id);
    button.setAttribute("aria-pressed", String(active === r.id));
    const tag = document.createElement("b");
    tag.textContent = r.id;
    tag.style.background = colors[i % colors.length];
    const stops = document.createElement("span");
    stops.className = "stops";
    stops.textContent = r.start.join(",") + " → " + r.goal.join(",");
    const at = document.createElement("span");
    at.className = "arrive";
    at.textContent = result?.paths
      ? "t=" + (result.paths[i].cells.length - 1)
      : "—";
    button.append(tag, stops, at);
    button.onclick = () => {
      active = active === r.id ? null : r.id;
      roster();
      paint();
    };
    el.append(button);
  }
}
function display(state, feedback) {
  get("state").textContent = state;
  get("feedback").textContent = feedback;
  const stats = result?.stats;
  for (const [id, v] of [
    ["cost", result?.cost],
    ["makespan", result?.makespan],
    ["conflicts", stats?.initialConflicts],
    ["expanded", stats?.highExpanded],
    ["searches", stats?.lowSearches],
  ])
    get(id).textContent = v ?? "—";
  roster();
  controls();
  paint();
}
function stopWorker() {
  worker?.terminate();
  worker = null;
}
function plan() {
  stopWorker();
  pause();
  clock = 0;
  result = null;
  display("Planning", "Searching for conflict-free routes…");
  const job = new Worker("/web/worker.js", { type: "module" });
  worker = job;
  job.onmessage = ({ data: answer }) => {
    if (worker !== job) return;
    stopWorker();
    result = answer;
    if (answer.status === "optimal")
      display(
        "Optimal",
        "Schedule verified · Robots stay parked at their final stations.",
      );
    else if (answer.status === "node_budget_reached")
      display(
        "Budget reached",
        "Search budget reached. Remaining schedules cost at least " +
          answer.lowerBound +
          " robot-ticks.",
      );
    else if (answer.status === "infeasible_within_horizon")
      display(
        "Infeasible",
        "No schedule fits this floor within 64 ticks. Edit a wall or try another scenario.",
      );
    else display("Error", answer.message ?? "Planning failed.");
  };
  job.onerror = () => {
    if (worker === job) {
      stopWorker();
      display("Error", "Planner worker failed to load.");
    }
  };
  job.postMessage(data);
}
async function selectScenario() {
  const token = ++version;
  stopWorker();
  pause();
  edit = false;
  backup = null;
  active = null;
  data = null;
  result = null;
  clock = 0;
  cursor = [0, 0];
  display("Loading", "Loading floor…");
  try {
    const response = await fetch(
      "/examples/" + get("scenario").value + ".json",
    );
    if (!response.ok) throw Error("Floor could not be loaded.");
    const scenario = await response.json();
    if (token !== version) return;
    data = scenario;
    plan();
  } catch (e) {
    if (token === version) display("Error", e.message);
  }
}
get("scenario").onchange = selectScenario;
get("play").onclick = () => {
  if (playing) {
    pause();
    return;
  }
  if (clock >= result.makespan) clock = 0;
  playing = true;
  last = 0;
  controls();
  frame = requestAnimationFrame(animate);
};
get("step").onclick = () => {
  pause();
  clock = Math.min(result.makespan, Math.floor(clock) + 1);
  paint();
};
get("rewind").onclick = () => {
  pause();
  clock = 0;
  paint();
};
get("timeline").oninput = () => {
  pause();
  clock = Number(get("timeline").value);
  paint();
};
get("trails").onchange = paint;
get("edit").onclick = () => {
  if (edit) {
    edit = false;
    backup = null;
    plan();
    return;
  }
  stopWorker();
  pause();
  backup = data.map.slice();
  edit = true;
  result = null;
  clock = 0;
  active = null;
  display(
    "Editing",
    "Toggle racks by clicking cells or using arrow keys and Space. Robot stations are fixed.",
  );
  canvas.focus({ preventScroll: true });
};
get("cancel").onclick = () => {
  data.map = backup;
  backup = null;
  edit = false;
  plan();
};
function toggle(x, y) {
  if (
    !edit ||
    x < 0 ||
    y < 0 ||
    x >= data.map[0].length ||
    y >= data.map.length
  )
    return;
  cursor = [x, y];
  if (
    data.robots.some((r) =>
      [r.start, r.goal].some((p) => p[0] === x && p[1] === y),
    )
  ) {
    get("feedback").textContent = "That cell is a robot station.";
    paint();
    return;
  }
  const row = data.map[y];
  data.map[y] =
    row.slice(0, x) + (row[x] === "#" ? "." : "#") + row.slice(x + 1);
  get("feedback").textContent =
    "Floor edited. Apply changes to calculate a new schedule.";
  paint();
}
canvas.addEventListener("click", (e) => {
  if (!edit || !geometry) return;
  const r = canvas.getBoundingClientRect();
  toggle(
    Math.floor((e.clientX - r.left - geometry.left) / geometry.size),
    Math.floor((e.clientY - r.top - geometry.top) / geometry.size),
  );
});
canvas.addEventListener("keydown", (e) => {
  if (!edit) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle(...cursor);
    return;
  }
  const offset = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[e.key];
  if (offset) {
    e.preventDefault();
    cursor = [
      Math.min(data.map[0].length - 1, Math.max(0, cursor[0] + offset[0])),
      Math.min(data.map.length - 1, Math.max(0, cursor[1] + offset[1])),
    ];
    paint();
  }
});
new ResizeObserver(paint).observe(canvas.parentElement);
document.fonts.ready.then(paint);
selectScenario();
