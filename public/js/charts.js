// ===================================================================
// charts.js – små grafer tegnet som SVG (ingen biblioteker).
//
// lineChartSVG() laver en linjegraf, fx rating over tid.
// Den bruges af Puzzle Dashboard, profilens rating-graf og Insights.
// ===================================================================

// values: en liste med tal, fx [1500, 1512, 1498, ...]
// options.labels: valgfri tekster under grafen (første og sidste)
function lineChartSVG(values, options = {}) {
  if (!values || values.length < 2) {
    return `<div class="chart-empty">${options.empty || "Play a few more to see a graph here."}</div>`;
  }

  // Grafens størrelse (SVG'en skaleres bagefter til boksens bredde)
  // (en bred graf, fx på profilen, får options.width = 700, så teksten ikke bliver kæmpestor)
  const W = options.width || 300, H = options.height || 120, PAD_L = 34, PAD_R = 6, PAD_T = 8, PAD_B = 18;
  let min = Math.min(...values), max = Math.max(...values);
  if (max - min < 20) { min -= 10; max += 10; } // flad linje: giv lidt luft
  const range = max - min;

  // Omregn hvert tal til et punkt (x, y) i grafen
  const x = (i) => PAD_L + (i / (values.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);

  // Linjen, og et farvet område under linjen
  const line = `M${points.join(" L")}`;
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;

  // Stiger eller falder grafen samlet set? (grøn eller rød)
  const color = values[values.length - 1] >= values[0] ? "var(--green)" : "#e45a4f";
  const labels = options.labels || [];

  return `
    <svg class="line-chart" viewBox="0 0 ${W} ${H}">
      <line x1="${PAD_L}" y1="${y(max)}" x2="${W - PAD_R}" y2="${y(max)}" class="chart-grid"/>
      <line x1="${PAD_L}" y1="${y(min)}" x2="${W - PAD_R}" y2="${y(min)}" class="chart-grid"/>
      <text x="${PAD_L - 4}" y="${y(max) + 4}" class="chart-label" text-anchor="end">${Math.round(max)}</text>
      <text x="${PAD_L - 4}" y="${y(min) + 4}" class="chart-label" text-anchor="end">${Math.round(min)}</text>
      ${labels[0] ? `<text x="${PAD_L}" y="${H - 4}" class="chart-label">${labels[0]}</text>` : ""}
      ${labels[1] ? `<text x="${W - PAD_R}" y="${H - 4}" class="chart-label" text-anchor="end">${labels[1]}</text>` : ""}
      <path d="${area}" fill="${color}" opacity="0.15"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

// En vandret "procent-bjælke", fx 72 % løst
function percentBar(pct, cls = "") {
  return `<span class="pct-bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></span>`;
}