export const colors = [
  "#a5e2b3",
  "#ffa876",
  "#92c6ff",
  "#f1ce69",
  "#dcb8ed",
  "#79dbd9",
  "#ff9baf",
  "#c4d987",
];

export function draw(
  canvas,
  world,
  result,
  clock,
  active,
  trails,
  editing,
  cursor,
) {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = rect.width,
    height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#182e2c";
  ctx.fillRect(0, 0, width, height);
  if (!world) return null;
  const cols = world.map[0].length,
    rows = world.map.length;
  const size = Math.min((width - 45) / cols, (height - 39) / rows);
  const left = (width - size * cols) / 2 + 5,
    top = (height - size * rows) / 2 + 4;
  ctx.font = Math.max(8, Math.min(11, size * 0.35)) + "px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = left + x * size,
        py = top + y * size;
      if (y === 0) {
        ctx.fillStyle = "#a4b8ac";
        ctx.fillText(String(x), px + size / 2, top - 10);
      }
      if (x === 0) {
        ctx.fillStyle = "#a4b8ac";
        ctx.fillText(String(y), left - 13, py + size / 2);
      }
      const rack = world.map[y][x] === "#";
      ctx.fillStyle = rack ? "#304947" : (x + y) % 2 ? "#223c38" : "#243e3a";
      ctx.fillRect(px + 1, py + 1, size - 1, size - 1);
      if (rack) {
        ctx.fillStyle = "#50645b";
        ctx.fillRect(
          px + size * 0.13,
          py + size * 0.16,
          size * 0.74,
          size * 0.62,
        );
        ctx.strokeStyle = "#748175";
        ctx.lineWidth = Math.max(0.65, size * 0.035);
        ctx.beginPath();
        ctx.moveTo(px + size * 0.14, py + size * 0.27);
        ctx.lineTo(px + size * 0.86, py + size * 0.27);
        ctx.moveTo(px + size * 0.14, py + size * 0.7);
        ctx.lineTo(px + size * 0.86, py + size * 0.7);
        ctx.stroke();
      }
    }
  const xy = ([x, y]) => [left + (x + 0.5) * size, top + (y + 0.5) * size];
  world.robots.forEach((r, i) => {
    const color = colors[i % colors.length],
      cells = result?.paths?.[i]?.cells ?? [r.start];
    ctx.globalAlpha = active === null || active === r.id ? 1 : 0.2;
    if (trails && cells.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.6, size * 0.075);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([size * 0.2, size * 0.15]);
      ctx.beginPath();
      cells.forEach((pt, j) => {
        const [x, y] = xy(pt),
          offset = ((i % 3) - 1) * size * 0.095;
        if (j) ctx.lineTo(x + offset, y + offset);
        else ctx.moveTo(x + offset, y + offset);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const [gx, gy] = xy(r.goal);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      gx - size * 0.31,
      gy - size * 0.31,
      size * 0.62,
      size * 0.62,
    );
    ctx.globalAlpha = 1;
  });
  world.robots.forEach((r, i) => {
    const path = result?.paths?.[i]?.cells ?? [r.start],
      t = Math.floor(clock),
      a = path[Math.min(t, path.length - 1)],
      b = path[Math.min(t + 1, path.length - 1)];
    const [x, y] = xy([
      a[0] + (b[0] - a[0]) * (clock - t),
      a[1] + (b[1] - a[1]) * (clock - t),
    ]);
    ctx.globalAlpha = active === null || active === r.id ? 1 : 0.25;
    const w = Math.min(size * 0.86, 30),
      h = w * 0.76;
    ctx.fillStyle = "#102420";
    ctx.fillRect(x - w * 0.57, y - h * 0.38, w * 1.14, h * 0.76);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - h * 0.5, w, h, Math.min(4, w * 0.15));
    ctx.fill();
    ctx.strokeStyle = "#102420";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#102420";
    ctx.font = "bold " + Math.max(7, w * 0.4) + "px monospace";
    ctx.fillText(r.id.slice(0, 3), x, y + 0.3);
    ctx.globalAlpha = 1;
  });
  if (editing) {
    const [x, y] = xy(cursor);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - size * 0.47, y - size * 0.47, size * 0.94, size * 0.94);
  }
  return { left, top, size };
}
