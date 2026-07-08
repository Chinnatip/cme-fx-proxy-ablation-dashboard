const DATA = window.CME_ABLATION_DATA;

const state = {
  timeframe: "1d",
  mode: null,
  lookback: null,
  holding: null,
  currentCurve: [],
  signalHoverIndex: null,
  exposureHoverIndex: null,
  exposureHoverAsset: null,
  exposureAssets: [],
};

const fmtPct = (value) => `${(Number(value) * 100).toFixed(2)}%`;
const fmtNum = (value) => Number(value).toFixed(2);
const modeLabel = (mode) => DATA.meta.mode_labels[mode] || mode;

function init() {
  if (!DATA.runs[state.timeframe]) state.timeframe = Object.keys(DATA.runs)[0];
  setStateFromCandidate(currentRun().best_id);
  syncStateToRun();
  renderTabs();
  renderSelectors();
  renderAll();
  attachChartInteractions();
}

function currentRun() {
  return DATA.runs[state.timeframe];
}

function syncStateToRun() {
  const run = currentRun();
  if (!run.modes.includes(state.mode)) state.mode = run.modes[0];
  if (!run.lookbacks.includes(Number(state.lookback))) state.lookback = run.lookbacks[0];
  if (!run.holding_periods.includes(Number(state.holding))) state.holding = run.holding_periods[0];
  if (!findCandidate()) {
    const fallback = run.candidates[0];
    state.mode = fallback.score_mode;
    state.lookback = Number(fallback.lookback);
    state.holding = Number(fallback.holding_period);
  }
}

function setStateFromCandidate(candidateId) {
  const run = currentRun();
  const candidate = run.candidates.find((item) => item.id === candidateId) || run.candidates[0];
  state.mode = candidate.score_mode;
  state.lookback = Number(candidate.lookback);
  state.holding = Number(candidate.holding_period);
}

function findCandidate() {
  const run = currentRun();
  return run.candidates.find(
    (item) =>
      item.score_mode === state.mode &&
      Number(item.lookback) === Number(state.lookback) &&
      Number(item.holding_period) === Number(state.holding),
  );
}

function renderTabs() {
  const tabs = document.getElementById("timeframeTabs");
  tabs.innerHTML = "";
  Object.entries(DATA.runs).forEach(([key, run]) => {
    const btn = document.createElement("button");
    btn.textContent = key.toUpperCase();
    btn.className = key === state.timeframe ? "active" : "";
    btn.title = run.description;
    btn.addEventListener("click", () => {
      state.timeframe = key;
      setStateFromCandidate(DATA.runs[key].best_id);
      syncStateToRun();
      renderTabs();
      renderSelectors();
      renderAll();
    });
    tabs.appendChild(btn);
  });
}

function renderSelectors() {
  const run = currentRun();
  fillSelect("modeSelect", run.modes, state.mode, (mode) => modeLabel(mode), (value) => {
    state.mode = value;
    syncStateToRun();
    renderSelectors();
    renderAll();
  });
  fillSelect("jSelect", run.lookbacks, state.lookback, (j) => `J=${j} ${run.unit}`, (value) => {
    state.lookback = Number(value);
    syncStateToRun();
    renderSelectors();
    renderAll();
  });
  fillSelect("kSelect", run.holding_periods, state.holding, (k) => `K=${k} ${run.unit}`, (value) => {
    state.holding = Number(value);
    syncStateToRun();
    renderSelectors();
    renderAll();
  });
}

function fillSelect(id, values, selected, labeler, onChange) {
  const select = document.getElementById(id);
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.appendChild(option);
  });
  select.value = selected;
  select.onchange = () => onChange(select.value);
}

function renderAll() {
  const run = currentRun();
  const candidate = findCandidate() || run.candidates[0];
  const curve = run.curves[candidate.id] || [];
  state.currentCurve = curve;
  state.signalHoverIndex = null;
  state.exposureHoverIndex = null;
  state.exposureHoverAsset = null;
  hideTooltip();

  document.getElementById("chartTitle").textContent = `${run.label}`;
  document.getElementById("candidateChip").textContent = `${modeLabel(candidate.score_mode)} | J=${candidate.lookback} K=${candidate.holding_period}`;
  document.getElementById("sourceWarning").textContent = DATA.meta.source_note + " " + DATA.meta.warning;
  renderVerdict(candidate, run);
  renderKpis(candidate, curve);
  renderInsight(candidate, run);
  renderReturnBars();
  renderMatrix(candidate, run);
  renderCoverage(run.coverage);
  renderBestTable();
  drawEquity(curve, candidate);
  drawSignalTape(curve);
  drawExposureMap(curve);
}

function attachChartInteractions() {
  const signalCanvas = document.getElementById("signalCanvas");
  const exposureCanvas = document.getElementById("exposureCanvas");

  signalCanvas.addEventListener("mousemove", (event) => {
    const curve = state.currentCurve;
    const plot = signalPlot(signalCanvas, curve);
    const idx = eventToIndex(event, signalCanvas, curve, plot.pad);
    if (idx === null) {
      hideTooltip();
      return;
    }
    state.signalHoverIndex = idx;
    drawSignalTape(curve);
    showSignalTooltip(event, curve, idx);
  });

  signalCanvas.addEventListener("mouseleave", () => {
    state.signalHoverIndex = null;
    hideTooltip();
    drawSignalTape(state.currentCurve);
  });

  exposureCanvas.addEventListener("mousemove", (event) => {
    const curve = state.currentCurve;
    const plot = exposurePlot(exposureCanvas, curve);
    const idx = eventToIndex(event, exposureCanvas, curve, plot.pad);
    const asset = eventToAsset(event, exposureCanvas, plot);
    if (idx === null || !asset) {
      hideTooltip();
      return;
    }
    state.exposureHoverIndex = idx;
    state.exposureHoverAsset = asset;
    drawExposureMap(curve);
    showExposureTooltip(event, curve, idx, asset);
  });

  exposureCanvas.addEventListener("mouseleave", () => {
    state.exposureHoverIndex = null;
    state.exposureHoverAsset = null;
    hideTooltip();
    drawExposureMap(state.currentCurve);
  });
}

function renderVerdict(candidate, run) {
  const verdict = document.getElementById("verdictText");
  const note = document.getElementById("verdictNote");
  if (candidate.annualized_return > 0 && candidate.sharpe_ratio > 0.5) {
    verdict.textContent = "มี edge แบบต้องตรวจต่อ";
  } else if (candidate.annualized_return > 0) {
    verdict.textContent = "บวก แต่ยังบาง";
  } else {
    verdict.textContent = "ยังไม่ผ่าน";
  }
  note.textContent = `${run.range.first.slice(0, 10)} ถึง ${run.range.last.slice(0, 10)} | ${run.range.assets} currencies`;
}

function renderKpis(candidate, curve) {
  const lastEquity = curve.length ? curve[curve.length - 1].equity : 1;
  const metrics = [
    ["Annualized Return", fmtPct(candidate.annualized_return), candidate.annualized_return >= 0 ? "good" : "bad"],
    ["Sharpe", fmtNum(candidate.sharpe_ratio), candidate.sharpe_ratio >= 0 ? "good" : "bad"],
    ["Max Drawdown", fmtPct(candidate.max_drawdown), "bad"],
    ["Final Equity", `${fmtNum(lastEquity)}x`, lastEquity >= 1 ? "good" : "bad"],
  ];
  document.getElementById("metrics").innerHTML = metrics
    .map(([label, value, tone]) => `<div class="kpi"><span>${label}</span><strong class="${tone}">${value}</strong></div>`)
    .join("");
}

function renderInsight(candidate, run) {
  const title = document.getElementById("insightTitle");
  const text = document.getElementById("insightText");
  const details = document.getElementById("candidateDetails");

  if (candidate.annualized_return > 0 && candidate.sharpe_ratio > 0.5) {
    title.textContent = "สเกลนี้เริ่มมีหน้าตา";
    text.textContent = "ผลตอบแทนหลังต้นทุนเป็นบวกและ Sharpe พอเห็น signal แต่ยังต้องระวังว่าช่วงข้อมูลสั้นมาก โดยเฉพาะ 1M ที่จำนวน observation น้อยจนอ่านเป็นหลักฐานแข็งไม่ได้";
  } else if (candidate.annualized_return > 0) {
    title.textContent = "มีบวก แต่ยังไม่แข็ง";
    text.textContent = "candidate นี้ยังพอมีกำไรเฉลี่ย แต่คุณภาพความเสี่ยงยังบาง อาจเหมาะใช้เป็น clue ว่า J/K ไหนควรขยาย test มากกว่าจะสรุปว่า tradable แล้ว";
  } else {
    title.textContent = "noise ยังชนะ signal";
    text.textContent = "ผลหลังต้นทุนติดลบ แปลว่า mode/J/K ชุดนี้ยังโดน noise, turnover หรือเลือกขา long-short ไม่ดีพอ ต้องใช้เป็น evidence ฝั่งตัดทิ้งมากกว่าฝั่งโปรโมต";
  }

  details.innerHTML = `
    <dt>Mode</dt><dd>${modeLabel(candidate.score_mode)}</dd>
    <dt>Lookback J</dt><dd>${candidate.lookback} ${run.unit}</dd>
    <dt>Holding K</dt><dd>${candidate.holding_period} ${run.unit}</dd>
    <dt>Hit Rate</dt><dd>${fmtPct(candidate.hit_rate)}</dd>
    <dt>Turnover</dt><dd>${fmtNum(candidate.turnover)}</dd>
    <dt>Fee Drag</dt><dd>${fmtPct(candidate.fee_drag)}</dd>
  `;
}

function renderReturnBars() {
  const best = DATA.best;
  const maxAbs = Math.max(...best.map((item) => Math.abs(item.annualized_return)), 0.01);
  document.getElementById("returnBars").innerHTML = best
    .map((item) => {
      const width = Math.max(4, (Math.abs(item.annualized_return) / maxAbs) * 100);
      const good = item.annualized_return >= 0;
      return `
        <div class="bar-row">
          <header><span>${item.timeframe.toUpperCase()} best: ${modeLabel(item.score_mode)} J=${item.lookback} K=${item.holding_period}</span><strong>${fmtPct(item.annualized_return)}</strong></header>
          <div class="bar-track"><div class="bar-fill ${good ? "good" : ""}" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function renderCoverage(rows) {
  document.getElementById("coverageBody").innerHTML = rows
    .map((row) => {
      const basis = Number(row.mean_basis_bps || 0).toFixed(2);
      return `<tr>
        <td>${row.asset_id}</td>
        <td>${row.futures_symbol}</td>
        <td>${row.processed_rows || row.raw_rows || row.joined_rows}</td>
        <td>${String(row.first_timestamp).slice(0, 16)}</td>
        <td>${String(row.last_timestamp).slice(0, 16)}</td>
        <td>${basis}</td>
      </tr>`;
    })
    .join("");
}

function renderMatrix(selected, run) {
  const candidates = run.candidates.filter((item) => item.score_mode === state.mode);
  const maxAbsReturn = Math.max(...candidates.map((item) => Math.abs(Number(item.annualized_return))), 0.01);
  const byKey = new Map(candidates.map((item) => [`${item.lookback}|${item.holding_period}`, item]));
  document.getElementById("matrixTitle").textContent = `${modeLabel(state.mode)} | ${run.label}`;
  const header = `<tr><th>J \\ K</th>${run.holding_periods.map((k) => `<th>K=${k}</th>`).join("")}</tr>`;
  const rows = run.lookbacks
    .map((j) => {
      const cells = run.holding_periods
        .map((k) => {
          const item = byKey.get(`${j}|${k}`);
          if (!item) return `<td class="matrix-empty">-</td>`;
          const strength = Math.min(Math.abs(Number(item.annualized_return)) / maxAbsReturn, 1);
          const good = Number(item.annualized_return) >= 0;
          const selectedClass =
            item.score_mode === selected.score_mode &&
            Number(item.lookback) === Number(selected.lookback) &&
            Number(item.holding_period) === Number(selected.holding_period)
              ? " selected"
              : "";
          const bg = good
            ? `rgba(32, 214, 159, ${0.08 + strength * 0.34})`
            : `rgba(255, 95, 122, ${0.08 + strength * 0.28})`;
          return `<td class="matrix-cell${selectedClass}" style="background:${bg}">
            <button type="button" data-mode="${item.score_mode}" data-j="${item.lookback}" data-k="${item.holding_period}">
              <strong class="${good ? "good" : "bad"}">${fmtPct(item.annualized_return)}</strong>
              <span>Sharpe ${fmtNum(item.sharpe_ratio)}</span>
            </button>
          </td>`;
        })
        .join("");
      return `<tr><th>J=${j}</th>${cells}</tr>`;
    })
    .join("");

  const wrap = document.getElementById("matrixWrap");
  wrap.innerHTML = `<table class="matrix-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
  wrap.querySelectorAll("button[data-j]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.lookback = Number(button.dataset.j);
      state.holding = Number(button.dataset.k);
      renderSelectors();
      renderAll();
    });
  });
}

function renderBestTable() {
  document.getElementById("bestBody").innerHTML = DATA.best
    .map(
      (row) => `<tr>
        <td>${row.timeframe.toUpperCase()}</td>
        <td>${modeLabel(row.score_mode)}</td>
        <td>${row.lookback}</td>
        <td>${row.holding_period}</td>
        <td class="${row.annualized_return >= 0 ? "good" : "bad"}">${fmtPct(row.annualized_return)}</td>
        <td>${fmtNum(row.sharpe_ratio)}</td>
        <td class="bad">${fmtPct(row.max_drawdown)}</td>
      </tr>`,
    )
    .join("");
}

function drawEquity(curve, candidate) {
  const canvas = document.getElementById("equityCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07101b";
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 64, right: 28, top: 30, bottom: 58 };
  const values = curve.map((point) => point.equity);
  if (!values.length) {
    ctx.fillStyle = "#8190a4";
    ctx.fillText("No curve data", 80, 80);
    return;
  }
  const min = Math.min(...values, 1);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, 0.02);
  const yMin = min - span * 0.08;
  const yMax = max + span * 0.08;
  const x = (idx) => pad.left + (idx / Math.max(values.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-9)) * (height - pad.top - pad.bottom);

  drawGrid(ctx, width, height, pad, yMin, yMax, y);
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, candidate.annualized_return >= 0 ? "rgba(32, 214, 159, 0.24)" : "rgba(255, 95, 122, 0.22)");
  gradient.addColorStop(1, "rgba(32, 214, 159, 0.00)");
  ctx.beginPath();
  values.forEach((value, idx) => {
    const px = x(idx);
    const py = y(value);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineTo(x(values.length - 1), height - pad.bottom);
  ctx.lineTo(x(0), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  values.forEach((value, idx) => {
    const px = x(idx);
    const py = y(value);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineWidth = 3;
  ctx.strokeStyle = candidate.annualized_return >= 0 ? "#20d69f" : "#ff5f7a";
  ctx.stroke();

  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y(1));
  ctx.lineTo(width - pad.right, y(1));
  ctx.strokeStyle = "rgba(238, 245, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#8190a4";
  ctx.font = "18px 'Noto Sans Thai'";
  ctx.fillText(`Equity ${fmtNum(values.at(-1))}x`, pad.left, 24);
  ctx.fillText(String(curve[0].date).slice(0, 10), pad.left, height - 22);
  ctx.textAlign = "right";
  ctx.fillText(String(curve.at(-1).date).slice(0, 10), width - pad.right, height - 22);
  ctx.textAlign = "left";
}

function drawSignalTape(curve) {
  const canvas = document.getElementById("signalCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07101b";
  ctx.fillRect(0, 0, width, height);

  const signalChip = document.getElementById("signalChip");
  if (!curve.length) {
    ctx.fillStyle = "#8190a4";
    ctx.fillText("No signal data", 80, 80);
    signalChip.textContent = "No signal data";
    return;
  }

  const { pad, maxAbs, x, zeroY, y, barWidth } = signalPlot(canvas, curve);

  drawSignalGrid(ctx, width, height, pad, maxAbs, zeroY, y);

  curve.forEach((point, idx) => {
    const value = Number(point.net_return || 0);
    const px = x(idx);
    const py = y(value);
    ctx.fillStyle = value >= 0 ? "rgba(32, 214, 159, 0.82)" : "rgba(255, 95, 122, 0.82)";
    ctx.fillRect(px - barWidth / 2, Math.min(py, zeroY), barWidth, Math.max(2, Math.abs(zeroY - py)));

    const previous = curve[idx - 1];
    const changed =
      !previous || previous.top_assets !== point.top_assets || previous.bottom_assets !== point.bottom_assets;
    if (changed) {
      ctx.beginPath();
      ctx.arc(px, zeroY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#63e6ff";
      ctx.fill();
    }
  });

  if (state.signalHoverIndex !== null) {
    drawSignalHover(ctx, curve, state.signalHoverIndex, x, y, zeroY, barWidth, height, pad);
  }

  drawPositionLabels(ctx, curve, x, height, pad);

  const latest = curve[curve.length - 1];
  signalChip.textContent = `ล่าสุด Long ${latest.top_assets || "-"} / Short ${latest.bottom_assets || "-"}`;
  ctx.fillStyle = "#8190a4";
  ctx.font = "16px 'Noto Sans Thai'";
  ctx.fillText("Net return per rebalance", pad.left, 20);
  ctx.fillText(String(curve[0].date).slice(0, 10), pad.left, height - 20);
  ctx.textAlign = "right";
  ctx.fillText(String(curve[curve.length - 1].date).slice(0, 10), width - pad.right, height - 20);
  ctx.textAlign = "left";
}

function signalPlot(canvas, curve) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 64, right: 28, top: 26, bottom: 72 };
  const returns = curve.map((point) => Number(point.net_return || 0));
  const maxAbs = Math.max(...returns.map((value) => Math.abs(value)), 0.01);
  const x = (idx) => pad.left + (idx / Math.max(curve.length - 1, 1)) * (width - pad.left - pad.right);
  const zeroY = pad.top + (height - pad.top - pad.bottom) / 2;
  const y = (value) => zeroY - (value / maxAbs) * ((height - pad.top - pad.bottom) / 2) * 0.88;
  const barWidth = Math.max(3, Math.min(18, (width - pad.left - pad.right) / Math.max(curve.length, 1) * 0.56));
  return { pad, maxAbs, x, zeroY, y, barWidth };
}

function drawSignalHover(ctx, curve, idx, x, y, zeroY, barWidth, height, pad) {
  const point = curve[idx];
  const value = Number(point.net_return || 0);
  const px = x(idx);
  const py = y(value);
  ctx.save();
  ctx.strokeStyle = "rgba(99, 230, 255, 0.82)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(px, pad.top);
  ctx.lineTo(px, height - pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#eef5ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(px - barWidth / 2 - 3, Math.min(py, zeroY) - 3, barWidth + 6, Math.max(8, Math.abs(zeroY - py) + 6));
  ctx.beginPath();
  ctx.arc(px, zeroY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#63e6ff";
  ctx.fill();
  ctx.restore();
}

function drawSignalGrid(ctx, width, height, pad, maxAbs, zeroY, y) {
  ctx.strokeStyle = "rgba(166, 184, 208, 0.12)";
  ctx.lineWidth = 1;
  ctx.font = "13px 'Noto Sans Thai'";
  ctx.fillStyle = "#8190a4";

  [-1, -0.5, 0, 0.5, 1].forEach((ratio) => {
    const value = ratio * maxAbs;
    const py = ratio === 0 ? zeroY : y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillText(fmtPct(value), 12, py + 4);
  });
}

function drawPositionLabels(ctx, curve, x, height, pad) {
  const labelY = height - pad.bottom + 26;
  ctx.font = "12px 'Noto Sans Thai'";
  ctx.textAlign = "center";

  const segments = [];
  curve.forEach((point, idx) => {
    const label = `L ${point.top_assets || "-"} / S ${point.bottom_assets || "-"}`;
    const previous = segments[segments.length - 1];
    if (previous && previous.label === label) {
      previous.end = idx;
    } else {
      segments.push({ label, start: idx, end: idx });
    }
  });

  segments.forEach((segment, idx) => {
    if (idx % Math.max(1, Math.ceil(segments.length / 9)) !== 0 && segment.end - segment.start < 2) return;
    const mid = (segment.start + segment.end) / 2;
    const px = x(mid);
    const text = segment.label.length > 18 ? `${segment.label.slice(0, 18)}...` : segment.label;
    ctx.fillStyle = idx % 2 === 0 ? "#bad7ff" : "#aebbd0";
    ctx.fillText(text, px, labelY + (idx % 2) * 18);
  });

  ctx.textAlign = "left";
}

function drawExposureMap(curve) {
  const canvas = document.getElementById("exposureCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07101b";
  ctx.fillRect(0, 0, width, height);

  const chip = document.getElementById("exposureChip");
  if (!curve.length) {
    ctx.fillStyle = "#8190a4";
    ctx.fillText("No exposure data", 80, 80);
    chip.textContent = "No exposure data";
    return;
  }

  const assets = Array.from(
    new Set(curve.flatMap((point) => [point.top_assets, point.bottom_assets].filter(Boolean))),
  ).sort();
  state.exposureAssets = assets;
  const { pad, cellWidth, rowHeight } = exposurePlot(canvas, curve, assets);

  ctx.font = "15px 'Noto Sans Thai'";
  ctx.fillStyle = "#8190a4";
  ctx.fillText("Exposure by rebalance period", pad.left, 22);

  assets.forEach((asset, rowIdx) => {
    const y = pad.top + rowIdx * rowHeight;
    ctx.fillStyle = "#aebbd0";
    ctx.textAlign = "right";
    ctx.fillText(asset, pad.left - 12, y + rowHeight * 0.62);
    ctx.textAlign = "left";

    curve.forEach((point, idx) => {
      const exposure = point.top_assets === asset ? 0.5 : point.bottom_assets === asset ? -0.5 : 0;
      const x = pad.left + idx * cellWidth;
      ctx.fillStyle = exposureColor(exposure);
      ctx.fillRect(x, y + 2, Math.max(1, cellWidth + 0.5), Math.max(2, rowHeight - 4));
    });
  });

  drawExposureGrid(ctx, width, height, pad, curve, assets, cellWidth, rowHeight);
  if (state.exposureHoverIndex !== null && state.exposureHoverAsset) {
    drawExposureHover(ctx, width, height, pad, assets, cellWidth, rowHeight);
  }

  const longCounts = {};
  const shortCounts = {};
  assets.forEach((asset) => {
    longCounts[asset] = 0;
    shortCounts[asset] = 0;
  });
  curve.forEach((point) => {
    if (point.top_assets) longCounts[point.top_assets] = (longCounts[point.top_assets] || 0) + 1;
    if (point.bottom_assets) shortCounts[point.bottom_assets] = (shortCounts[point.bottom_assets] || 0) + 1;
  });
  const mostLong = topCountLabel(longCounts);
  const mostShort = topCountLabel(shortCounts);
  chip.textContent = `Long บ่อยสุด ${mostLong} / Short บ่อยสุด ${mostShort}`;

  ctx.fillStyle = "#8190a4";
  ctx.font = "13px 'Noto Sans Thai'";
  ctx.fillText(String(curve[0].date).slice(0, 10), pad.left, height - 18);
  ctx.textAlign = "right";
  ctx.fillText(String(curve[curve.length - 1].date).slice(0, 10), width - pad.right, height - 18);
  ctx.textAlign = "left";
}

function exposurePlot(canvas, curve, assets = state.exposureAssets) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 72, right: 28, top: 34, bottom: 54 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const cellWidth = Math.max(2, plotWidth / Math.max(curve.length, 1));
  const rowHeight = plotHeight / Math.max(assets.length, 1);
  return { pad, cellWidth, rowHeight, assets };
}

function drawExposureHover(ctx, width, height, pad, assets, cellWidth, rowHeight) {
  const idx = state.exposureHoverIndex;
  const rowIdx = assets.indexOf(state.exposureHoverAsset);
  if (idx < 0 || rowIdx < 0) return;
  const x = pad.left + idx * cellWidth;
  const y = pad.top + rowIdx * rowHeight;
  ctx.save();
  ctx.strokeStyle = "rgba(99, 230, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, pad.top, Math.max(2, cellWidth), height - pad.top - pad.bottom);
  ctx.strokeStyle = "rgba(238, 245, 255, 0.72)";
  ctx.strokeRect(pad.left, y + 2, width - pad.left - pad.right, Math.max(2, rowHeight - 4));
  ctx.restore();
}

function exposureColor(exposure) {
  if (exposure > 0) return "rgba(32, 214, 159, 0.82)";
  if (exposure < 0) return "rgba(255, 95, 122, 0.82)";
  return "rgba(129, 144, 164, 0.12)";
}

function drawExposureGrid(ctx, width, height, pad, curve, assets, cellWidth, rowHeight) {
  ctx.strokeStyle = "rgba(166, 184, 208, 0.12)";
  ctx.lineWidth = 1;
  assets.forEach((_, idx) => {
    const y = pad.top + idx * rowHeight;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  });

  const step = Math.max(1, Math.ceil(curve.length / 6));
  ctx.font = "12px 'Noto Sans Thai'";
  ctx.fillStyle = "#8190a4";
  for (let idx = 0; idx < curve.length; idx += step) {
    const x = pad.left + idx * cellWidth;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillText(String(curve[idx].date).slice(5, 10), x + 2, height - pad.bottom + 20);
  }
}

function topCountLabel(counts) {
  const [asset, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  return `${asset} (${count})`;
}

function eventToIndex(event, canvas, curve, pad) {
  if (!curve.length) return null;
  const point = canvasPoint(event, canvas);
  if (point.x < pad.left || point.x > canvas.width - pad.right) return null;
  const ratio = (point.x - pad.left) / Math.max(canvas.width - pad.left - pad.right, 1);
  const idx = Math.round(ratio * Math.max(curve.length - 1, 1));
  return Math.max(0, Math.min(curve.length - 1, idx));
}

function eventToAsset(event, canvas, plot) {
  const point = canvasPoint(event, canvas);
  const { pad, rowHeight, assets } = plot;
  if (point.y < pad.top || point.y > canvas.height - pad.bottom) return null;
  const rowIdx = Math.floor((point.y - pad.top) / Math.max(rowHeight, 1));
  return assets[Math.max(0, Math.min(assets.length - 1, rowIdx))] || null;
}

function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width,
    y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height,
  };
}

function showSignalTooltip(event, curve, idx) {
  const point = curve[idx];
  const previous = curve[idx - 1];
  const changed =
    !previous || previous.top_assets !== point.top_assets || previous.bottom_assets !== point.bottom_assets;
  const previousText = previous
    ? `ก่อนหน้า: Long ${previous.top_assets} / Short ${previous.bottom_assets}`
    : "ก่อนหน้า: เริ่มรอบแรก";
  const actionText = changed ? "มีการปรับพอร์ต" : "ถือคู่เดิมต่อ";
  showTooltip(
    event,
    `<strong>${actionText}</strong>
     <span>Rebalance #${idx + 1} | ${String(point.date).slice(0, 10)}</span>
     <span>${previousText}</span>
     <span>หลังปรับ: <b>Long ${point.top_assets}</b> / <b>Short ${point.bottom_assets}</b></span>
     <span>น้ำหนักโดยประมาณ: Long +50% / Short -50%</span>
     <span>Net return รอบนี้: <b class="${Number(point.net_return) >= 0 ? "good" : "bad"}">${fmtPct(point.net_return)}</b></span>
     <span>Equity หลังจบรอบ: ${fmtNum(point.equity)}x</span>`,
  );
}

function showExposureTooltip(event, curve, idx, asset) {
  const point = curve[idx];
  const exposure = point.top_assets === asset ? 0.5 : point.bottom_assets === asset ? -0.5 : 0;
  const role = exposure > 0 ? "Long winner" : exposure < 0 ? "Short loser" : "ไม่ได้ถือ";
  showTooltip(
    event,
    `<strong>${asset}: ${role}</strong>
     <span>Rebalance #${idx + 1} | ${String(point.date).slice(0, 10)}</span>
     <span>พอร์ตทั้งรอบ: Long ${point.top_assets} / Short ${point.bottom_assets}</span>
     <span>Exposure ของ ${asset}: <b class="${exposure > 0 ? "good" : exposure < 0 ? "bad" : ""}">${fmtPct(exposure)}</b></span>
     <span>Net return รอบนี้: <b class="${Number(point.net_return) >= 0 ? "good" : "bad"}">${fmtPct(point.net_return)}</b></span>
     <span>Equity หลังจบรอบ: ${fmtNum(point.equity)}x</span>`,
  );
}

function showTooltip(event, html) {
  const tooltip = document.getElementById("chartTooltip");
  const panel = document.getElementById("equity");
  const panelRect = panel.getBoundingClientRect();
  tooltip.innerHTML = html;
  tooltip.classList.add("visible");

  const tooltipRect = tooltip.getBoundingClientRect();
  const offset = 18;
  let left = event.clientX - panelRect.left + offset;
  let top = event.clientY - panelRect.top + offset;
  if (left + tooltipRect.width > panelRect.width - 12) {
    left = event.clientX - panelRect.left - tooltipRect.width - offset;
  }
  if (top + tooltipRect.height > panelRect.height - 12) {
    top = event.clientY - panelRect.top - tooltipRect.height - offset;
  }
  tooltip.style.left = `${Math.max(12, left)}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  if (!tooltip) return;
  tooltip.classList.remove("visible");
}

function drawGrid(ctx, width, height, pad, yMin, yMax, y) {
  ctx.strokeStyle = "rgba(166, 184, 208, 0.12)";
  ctx.lineWidth = 1;
  ctx.font = "13px 'Noto Sans Thai'";
  ctx.fillStyle = "#8190a4";
  for (let i = 0; i <= 5; i += 1) {
    const value = yMin + ((yMax - yMin) * i) / 5;
    const py = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillText(fmtNum(value), 16, py + 4);
  }
}

init();
