const SAMPLE_CASES = {
  fibonacci: {
    label: "Fibonacci",
    code: `def fib(n):
    if n <= 1:
        return n

    left = fib(n - 1)
    right = fib(n - 2)
    result = left + right
    return result`,
    invocation: "fib(5)",
  },
  factorial: {
    label: "Factorial",
    code: `def factorial(n):
    if n <= 1:
        return 1

    smaller = factorial(n - 1)
    result = n * smaller
    return result`,
    invocation: "factorial(5)",
  },
  array_sum: {
    label: "Array Sum",
    code: `def sum_array(values, index=0):
    if index == len(values):
        return 0

    current = values[index]
    tail_sum = sum_array(values, index + 1)
    result = current + tail_sum
    return result`,
    invocation: "sum_array([4, 7, 2, 9])",
  },
  perfect_squares: {
    label: "Perfect Squares",
    code: `def numSquares(n: int) -> int:
    per_sqau = [i * i for i in range(1, int(n ** 0.5) + 1)]

    def helper(rem):
        if rem == 0:
            return 0
        if rem < 0:
            return float('inf')

        ans = float('inf')

        for ps in per_sqau:
            res = 1 + helper(rem - ps)
            ans = min(ans, res)

        return ans

    return helper(n)`,
    invocation: "numSquares(5)",
  },
};

const EMPTY_MESSAGE = "Run a Python recursive function to see the live tree.";
const MAX_CALL_COUNT = 450;
const MAX_EVENT_COUNT = 12000;
const BUILTIN_FUNCTIONS = new Set(["len", "range", "int", "float", "min", "max", "sum", "sorted"]);
const TREE_MIN_ZOOM = 0.55;
const TREE_MAX_ZOOM = 2.4;
const TREE_ZOOM_STEP = 0.18;
const TREE_MIN_CANVAS_WIDTH = 560;
const TREE_MIN_CANVAS_HEIGHT = 420;

const state = {
  sampleKey: "fibonacci",
  trace: null,
  stepIndex: 0,
  isPlaying: false,
  playTimer: null,
  editTimer: null,
  speedMs: 900,
  zoom: 1,
};

const elements = {
  sampleButtons: document.getElementById("sampleButtons"),
  codeInput: document.getElementById("codeInput"),
  callInput: document.getElementById("callInput"),
  runBtn: document.getElementById("runBtn"),
  playBtn: document.getElementById("playBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  restartBtn: document.getElementById("restartBtn"),
  treePlayBtn: document.getElementById("treePlayBtn"),
  treePrevBtn: document.getElementById("treePrevBtn"),
  treeNextBtn: document.getElementById("treeNextBtn"),
  treeRestartBtn: document.getElementById("treeRestartBtn"),
  speedSelect: document.getElementById("speedSelect"),
  errorBox: document.getElementById("errorBox"),
  summaryCard: document.getElementById("summaryCard"),
  treeTitle: document.getElementById("treeTitle"),
  treeMeta: document.getElementById("treeMeta"),
  treeStage: document.getElementById("treeStage"),
  treeSvg: document.getElementById("treeSvg"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomResetBtn: document.getElementById("zoomResetBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  stepTitle: document.getElementById("stepTitle"),
  stepCounter: document.getElementById("stepCounter"),
  stepLine: document.getElementById("stepLine"),
  stepExplanation: document.getElementById("stepExplanation"),
  changeCount: document.getElementById("changeCount"),
  variableChanges: document.getElementById("variableChanges"),
  frameLabel: document.getElementById("frameLabel"),
  activeFrameTable: document.getElementById("activeFrameTable"),
  stackDepth: document.getElementById("stackDepth"),
  callStack: document.getElementById("callStack"),
  codeMeta: document.getElementById("codeMeta"),
  codeViewer: document.getElementById("codeViewer"),
  timelineTrack: document.getElementById("timelineTrack"),
};

function init() {
  renderSampleButtons();
  bindControls();
  loadSample(state.sampleKey, true);
}

function bindControls() {
  elements.runBtn.addEventListener("click", () => runVisualization(true));
  getPlayButtons().forEach((button) => button.addEventListener("click", togglePlayback));
  getPrevButtons().forEach((button) => button.addEventListener("click", () => setStep(state.stepIndex - 1)));
  getNextButtons().forEach((button) => button.addEventListener("click", () => setStep(state.stepIndex + 1)));
  getRestartButtons().forEach((button) => button.addEventListener("click", () => setStep(0)));
  elements.zoomOutBtn.addEventListener("click", () => setTreeZoom(state.zoom - TREE_ZOOM_STEP));
  elements.zoomResetBtn.addEventListener("click", () => setTreeZoom(1));
  elements.zoomInBtn.addEventListener("click", () => setTreeZoom(state.zoom + TREE_ZOOM_STEP));
  elements.treeStage.addEventListener("wheel", handleTreeWheel, { passive: false });
  elements.speedSelect.addEventListener("change", (event) => {
    state.speedMs = Number(event.target.value);
    if (state.isPlaying) {
      startPlayback();
    }
  });
  elements.codeInput.addEventListener("input", handleEditorChange);
  elements.callInput.addEventListener("input", handleEditorChange);
  syncTreeZoomControls();
}

function renderSampleButtons() {
  elements.sampleButtons.innerHTML = Object.entries(SAMPLE_CASES)
    .map(
      ([key, sample]) => `
        <button
          type="button"
          class="sample-button ${key === state.sampleKey ? "active" : ""}"
          data-sample="${key}"
        >
          ${escapeHtml(sample.label)}
        </button>
      `
    )
    .join("");

  elements.sampleButtons.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      loadSample(button.dataset.sample, true);
    });
  });
}

function loadSample(key, shouldRun) {
  const sample = SAMPLE_CASES[key];
  state.sampleKey = key;
  clearEditTimer();
  stopPlayback();
  hideError();
  elements.codeInput.value = sample.code;
  elements.callInput.value = sample.invocation;
  renderSampleButtons();
  renderSourceViewer(normalizeSource(sample.code), null);
  if (shouldRun) {
    runVisualization(true);
  } else {
    resetTraceState();
  }
}

function handleEditorChange() {
  const source = normalizeSource(elements.codeInput.value);
  const activeSample = state.sampleKey ? SAMPLE_CASES[state.sampleKey] : null;
  if (activeSample && source !== normalizeSource(activeSample.code)) {
    state.sampleKey = null;
    renderSampleButtons();
  }

  syncSuggestedInvocation(source);
  stopPlayback();
  hideError();
  renderSourceViewer(source, null);
  scheduleEditRun();
}

function runVisualization(autoPlay, options = {}) {
  clearEditTimer();
  stopPlayback();
  hideError();

  const source = normalizeSource(elements.codeInput.value);
  const invocation = normalizeInvocation(elements.callInput.value);
  const previousTrace = state.trace;
  const previousStepIndex = state.stepIndex;

  try {
    const trace = buildTraceFromPythonCode(source, invocation);
    state.trace = trace;
    state.stepIndex = 0;
    renderAll();
    if (trace.runtimeError) {
      showError(trace.runtimeError);
    }
    if (autoPlay) {
      startPlayback();
    }
  } catch (error) {
    const canKeepPreviousTrace =
      options.preserveTraceOnError && previousTrace && previousTrace.steps && previousTrace.steps.length;

    if (canKeepPreviousTrace) {
      state.trace = previousTrace;
      state.stepIndex = clamp(previousStepIndex, 0, previousTrace.steps.length - 1);
      renderAll();
      renderSourceViewer(source, null);
    } else {
      state.trace = null;
      state.stepIndex = 0;
      renderSourceViewer(source, null);
      renderEmptyState();
    }
    showError(error.message);
  }
}

function togglePlayback() {
  if (!state.trace) {
    return;
  }
  if (state.isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!state.trace) {
    return;
  }
  stopPlayback();
  state.isPlaying = true;
  syncPlayButtonLabel("Pause");
  state.playTimer = window.setInterval(() => {
    if (!state.trace || state.stepIndex >= state.trace.steps.length - 1) {
      stopPlayback();
      return;
    }
    setStep(state.stepIndex + 1);
  }, state.speedMs);
}

function stopPlayback() {
  state.isPlaying = false;
  syncPlayButtonLabel("Play");
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
}

function setStep(nextStep) {
  if (!state.trace) {
    return;
  }
  state.stepIndex = clamp(nextStep, 0, state.trace.steps.length - 1);
  if (state.stepIndex === state.trace.steps.length - 1) {
    stopPlayback();
  }
  renderAll();
  keepTimelineCardVisible();
}

function keepTimelineCardVisible() {
  const currentCard = elements.timelineTrack.querySelector(
    `[data-step-index="${state.stepIndex}"]`
  );
  if (!currentCard) {
    return;
  }

  const left = currentCard.offsetLeft;
  const right = left + currentCard.offsetWidth;
  const visibleLeft = elements.timelineTrack.scrollLeft;
  const visibleRight = visibleLeft + elements.timelineTrack.clientWidth;

  if (left < visibleLeft) {
    elements.timelineTrack.scrollTo({
      left: Math.max(0, left - 12),
      behavior: "smooth",
    });
  } else if (right > visibleRight) {
    elements.timelineTrack.scrollTo({
      left: right - elements.timelineTrack.clientWidth + 12,
      behavior: "smooth",
    });
  }
}

function handleTreeWheel(event) {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  event.preventDefault();
  const bounds = elements.treeStage.getBoundingClientRect();
  const focusXRatio = bounds.width
    ? clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    : 0.5;
  const focusYRatio = bounds.height
    ? clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
    : 0.5;

  setTreeZoom(state.zoom + (event.deltaY < 0 ? TREE_ZOOM_STEP : -TREE_ZOOM_STEP), {
    focusXRatio,
    focusYRatio,
  });
}

function setTreeZoom(nextZoom, options = {}) {
  const clampedZoom = clamp(nextZoom, TREE_MIN_ZOOM, TREE_MAX_ZOOM);
  const previousZoom = state.zoom;
  state.zoom = clampedZoom;
  syncTreeZoomControls();

  if (Math.abs(previousZoom - clampedZoom) < 0.001) {
    return;
  }

  const viewport = {
    left: elements.treeStage.scrollLeft || 0,
    top: elements.treeStage.scrollTop || 0,
    width: elements.treeStage.clientWidth || 0,
    height: elements.treeStage.clientHeight || 0,
  };
  const focusXRatio = options.focusXRatio ?? 0.5;
  const focusYRatio = options.focusYRatio ?? 0.5;
  const anchorX = viewport.left + viewport.width * focusXRatio;
  const anchorY = viewport.top + viewport.height * focusYRatio;
  const scaleRatio = clampedZoom / previousZoom;

  if (state.trace) {
    renderTree();
  } else {
    renderEmptyState();
  }

  elements.treeStage.scrollLeft = Math.max(0, anchorX * scaleRatio - viewport.width * focusXRatio);
  elements.treeStage.scrollTop = Math.max(0, anchorY * scaleRatio - viewport.height * focusYRatio);
}

function syncTreeZoomControls() {
  const percentage = `${Math.round(state.zoom * 100)}%`;
  elements.zoomResetBtn.textContent = percentage;
  elements.zoomOutBtn.disabled = state.zoom <= TREE_MIN_ZOOM + 0.001;
  elements.zoomInBtn.disabled = state.zoom >= TREE_MAX_ZOOM - 0.001;
}

function clearEditTimer() {
  if (!state.editTimer) {
    return;
  }
  const clearer =
    typeof window !== "undefined" && typeof window.clearTimeout === "function"
      ? window.clearTimeout.bind(window)
      : clearTimeout;
  clearer(state.editTimer);
  state.editTimer = null;
}

function scheduleEditRun() {
  clearEditTimer();

  const source = normalizeSource(elements.codeInput.value);
  const invocation = normalizeInvocation(elements.callInput.value);
  if (!source.trim()) {
    resetTraceState();
    return;
  }

  if (!invocation) {
    resetTraceState();
    showError("Enter a starting call such as fib(5), or let the app auto-fill one from your function.");
    return;
  }

  const scheduler =
    typeof window !== "undefined" && typeof window.setTimeout === "function"
      ? window.setTimeout.bind(window)
      : setTimeout;

  state.editTimer = scheduler(() => {
    state.editTimer = null;
    runVisualization(false, { preserveTraceOnError: true });
  }, 450);
}

function syncSuggestedInvocation(source) {
  const callText = normalizeInvocation(elements.callInput.value);
  const headers = detectTopLevelFunctionHeaders(source);
  if (!headers.length) {
    return;
  }

  const functionNames = headers.map((header) => header.name);
  const currentCallName = extractInvocationName(callText);
  const shouldReplace =
    !callText || !currentCallName || !functionNames.includes(currentCallName);

  if (!shouldReplace) {
    return;
  }

  const preferredHeader =
    headers.find((header) => header.name === currentCallName) ||
    headers[0];
  elements.callInput.value = buildSuggestedInvocation(preferredHeader);
}

function detectTopLevelFunctionHeaders(source) {
  const lines = normalizeSource(source)
    .split("\n")
    .map((raw, index) => ({
      raw,
      text: raw.trim(),
      indent: countIndent(raw),
      lineNo: index + 1,
    }));

  const headers = [];
  lines.forEach((line) => {
    if (line.indent !== 0 || isIgnorableLine(line)) {
      return;
    }
    const header = parseFunctionHeader(line);
    if (header) {
      headers.push(header);
    }
  });
  return headers;
}

function extractInvocationName(text) {
  const match = /^([A-Za-z_]\w*)\s*\(/.exec(String(text || "").trim());
  return match ? match[1] : "";
}

function buildSuggestedInvocation(header) {
  const requiredParams = getInvocationParameters(header.params).filter((param) => !param.defaultExpr);
  const args = requiredParams.map((param) => guessArgumentForParameter(param.name));
  return `${header.name}(${args.join(", ")})`;
}

function getInvocationParameters(params) {
  if (!params.length) {
    return params;
  }
  return params[0].isImplicitReceiver ? params.slice(1) : params;
}

function guessArgumentForParameter(name) {
  const lowered = String(name || "").toLowerCase();
  if (/^(n|num|nums|count|k|target|value|rem|steps?)$/.test(lowered)) {
    return "4";
  }
  if (/(left|right|low|high|start|end|index|idx|pos)/.test(lowered)) {
    return "0";
  }
  if (/(arr|array|list|nums|values|items|candidates|coins|paths)/.test(lowered)) {
    return "[1, 2, 3]";
  }
  if (/(text|word|string|path|letters|chars|s)$/.test(lowered)) {
    return "'abc'";
  }
  if (/(flag|found|seen)/.test(lowered)) {
    return "True";
  }
  return "1";
}

function resetTraceState() {
  clearEditTimer();
  state.trace = null;
  state.stepIndex = 0;
  renderEmptyState();
}

function renderAll() {
  if (!state.trace) {
    renderEmptyState();
    return;
  }
  renderSummary();
  renderTree();
  renderStepDetails();
  renderSourceViewer(state.trace.source, getCurrentStep().lineNo);
  renderTimeline();
  updateControls();
}

function renderEmptyState() {
  elements.treeTitle.textContent = "Run a sample to draw the tree";
  elements.treeMeta.innerHTML = `<span class="mini-pill">0 steps</span>`;
  elements.treeSvg.setAttribute("viewBox", `0 0 ${TREE_MIN_CANVAS_WIDTH} ${TREE_MIN_CANVAS_HEIGHT}`);
  elements.treeSvg.style.width = `${TREE_MIN_CANVAS_WIDTH * state.zoom}px`;
  elements.treeSvg.style.height = `${TREE_MIN_CANVAS_HEIGHT * state.zoom}px`;
  elements.treeSvg.innerHTML = `
    <text x="${TREE_MIN_CANVAS_WIDTH / 2}" y="${TREE_MIN_CANVAS_HEIGHT / 2 - 10}" text-anchor="middle" class="tree-node-label">${escapeHtml(
      EMPTY_MESSAGE
    )}</text>
  `;

  elements.summaryCard.innerHTML = `
    <div class="summary-card empty">
      Paste a Python recursive function, enter a starting call, and click Run Live.
    </div>
  `;

  elements.stepTitle.textContent = "Waiting for execution";
  elements.stepCounter.textContent = "0 / 0";
  elements.stepLine.textContent = "Line -";
  elements.stepExplanation.textContent =
    "Run a Python recursive function to see the line-by-line explanation here.";
  elements.changeCount.textContent = "0 changes";
  elements.variableChanges.innerHTML = `<div class="empty-state">No variable updates yet.</div>`;
  elements.frameLabel.textContent = "No frame";
  elements.activeFrameTable.innerHTML = `<div class="empty-state">No active frame yet.</div>`;
  elements.stackDepth.textContent = "0 frames";
  elements.callStack.innerHTML = `<div class="empty-state">The call stack will appear here.</div>`;
  elements.timelineTrack.innerHTML = `<div class="empty-state">Run the code to build a timeline.</div>`;
  updateControls();
}

function updateControls() {
  const hasTrace = Boolean(state.trace);
  const playbackDisabled = !hasTrace || state.trace.steps.length < 2;
  const prevDisabled = !hasTrace || state.stepIndex === 0;
  const nextDisabled = !hasTrace || state.stepIndex >= state.trace.steps.length - 1;

  getPlayButtons().forEach((button) => {
    button.disabled = playbackDisabled;
  });
  getPrevButtons().forEach((button) => {
    button.disabled = prevDisabled;
  });
  getNextButtons().forEach((button) => {
    button.disabled = nextDisabled;
  });
  getRestartButtons().forEach((button) => {
    button.disabled = prevDisabled;
  });
}

function getPlayButtons() {
  return [elements.playBtn, elements.treePlayBtn].filter(Boolean);
}

function getPrevButtons() {
  return [elements.prevBtn, elements.treePrevBtn].filter(Boolean);
}

function getNextButtons() {
  return [elements.nextBtn, elements.treeNextBtn].filter(Boolean);
}

function getRestartButtons() {
  return [elements.restartBtn, elements.treeRestartBtn].filter(Boolean);
}

function syncPlayButtonLabel(label) {
  getPlayButtons().forEach((button) => {
    button.textContent = label;
  });
}

function renderSummary() {
  const rootLabel = state.trace.rootLabels[0] || normalizeInvocation(elements.callInput.value);
  elements.summaryCard.innerHTML = `
    <div class="summary-grid">
      <div class="summary-stat">
        <span>Root Call</span>
        <strong>${escapeHtml(rootLabel)}</strong>
      </div>
      <div class="summary-stat">
        <span>Final Result</span>
        <strong>${escapeHtml(formatValue(state.trace.result))}</strong>
      </div>
      <div class="summary-stat">
        <span>Total Calls</span>
        <strong>${state.trace.meta.callCount}</strong>
      </div>
      <div class="summary-stat">
        <span>Trace Steps</span>
        <strong>${state.trace.steps.length}</strong>
      </div>
    </div>
  `;
}

function renderTree() {
  const step = getCurrentStep();
  const visibleNodes = state.trace.nodes.filter((node) => step.nodes[node.id]?.visible);
  const svgParts = [
    `<defs>
      <marker id="treeArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#161616"></path>
      </marker>
      <marker id="treeReturnArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f7a42"></path>
      </marker>
    </defs>`,
  ];

  visibleNodes.forEach((node) => {
    if (!node.parentId || !step.nodes[node.parentId]?.visible) {
      return;
    }
    const parent = state.trace.nodeMap[node.parentId];
    const isNew = node.createdStep === step.index;
    svgParts.push(`
      <line
        class="tree-edge ${isNew ? "new-edge" : ""}"
        x1="${parent.x}"
        y1="${parent.y + 18}"
        x2="${node.x}"
        y2="${node.y - 26}"
        marker-end="url(#treeArrow)"
      ></line>
    `);
  });

  visibleNodes.forEach((node) => {
    if (!node.parentId || !step.nodes[node.parentId]?.visible) {
      return;
    }

    const nodeState = step.nodes[node.id];
    if (nodeState.status !== "returned" || !Object.prototype.hasOwnProperty.call(nodeState, "returnValue")) {
      return;
    }

    const parent = state.trace.nodeMap[node.parentId];
    const returnPath = buildReturnArrow(node, parent);
    const isCurrentReturn = step.eventKind === "return" && step.eventFrameId === node.id;
    svgParts.push(`
      <g>
        <path
          class="tree-return-edge ${isCurrentReturn ? "current" : ""}"
          d="${returnPath.path}"
          marker-end="url(#treeReturnArrow)"
        ></path>
        <text
          class="tree-return-label"
          x="${returnPath.labelX}"
          y="${returnPath.labelY}"
          text-anchor="${returnPath.textAnchor}"
        >
          ${escapeHtml(`return ${formatValue(nodeState.returnValue)}`)}
        </text>
      </g>
    `);
  });

  visibleNodes.forEach((node) => {
    const nodeState = step.nodes[node.id];
    const isActive = step.activeNodeId === node.id;
    const isNew = node.createdStep === step.index;
    const labelWidth = getNodeLabelWidth(node.label);
    const labelClass = [
      "tree-node-label",
      nodeState.status === "returned" ? "tree-node-returned" : "",
      isActive ? "tree-node-active" : "",
      isNew ? "tree-node-new" : "",
    ]
      .filter(Boolean)
      .join(" ");

    svgParts.push(`
      <g>
        ${isActive ? `<ellipse class="tree-node-hit" cx="${node.x}" cy="${node.y - 7}" rx="${labelWidth / 2}" ry="25"></ellipse>` : ""}
        <text class="${labelClass}" x="${node.x}" y="${node.y}">${escapeHtml(node.label)}</text>
      </g>
    `);
  });

  elements.treeTitle.textContent = `Live tree for ${state.trace.rootLabels[0] || "the current run"}`;
  elements.treeMeta.innerHTML = `
    <span class="mini-pill">Step ${step.index + 1} / ${state.trace.steps.length}</span>
    <span class="mini-pill">${state.trace.meta.callCount} calls</span>
    <span class="mini-pill">Depth ${state.trace.meta.maxDepth}</span>
  `;
  elements.treeSvg.setAttribute(
    "viewBox",
    `0 0 ${state.trace.layout.width} ${state.trace.layout.height}`
  );
  elements.treeSvg.style.width = `${Math.max(state.trace.layout.width, TREE_MIN_CANVAS_WIDTH) * state.zoom}px`;
  elements.treeSvg.style.height = `${Math.max(state.trace.layout.height, TREE_MIN_CANVAS_HEIGHT) * state.zoom}px`;
  elements.treeSvg.innerHTML = svgParts.join("");
}

function renderStepDetails() {
  const step = getCurrentStep();
  const activeNode = step.nodes[step.activeNodeId];
  const changes = step.changes;
  const stackIds = step.stack;

  elements.stepTitle.textContent = step.title;
  elements.stepCounter.textContent = `${step.index + 1} / ${state.trace.steps.length}`;
  elements.stepLine.textContent = step.lineNo != null ? `Line ${step.lineNo}` : "Line -";
  elements.stepExplanation.textContent = step.explanation;
  elements.changeCount.textContent = `${changes.length} change${changes.length === 1 ? "" : "s"}`;
  elements.frameLabel.textContent = activeNode ? activeNode.label : "No frame";
  elements.stackDepth.textContent = `${stackIds.length} frame${stackIds.length === 1 ? "" : "s"}`;

  if (!changes.length) {
    elements.variableChanges.innerHTML = `
      <div class="empty-state">
        No tracked variables changed in this step.
      </div>
    `;
  } else {
    elements.variableChanges.innerHTML = changes
      .map(
        (change) => `
          <div class="change-card">
            <strong>${escapeHtml(change.name)}</strong>
            <span>${escapeHtml(formatValue(change.from))} -> ${escapeHtml(formatValue(change.to))}</span>
          </div>
        `
      )
      .join("");
  }

  if (!activeNode) {
    elements.activeFrameTable.innerHTML = `<div class="empty-state">No active frame.</div>`;
  } else {
    const rows = [
      ["call", activeNode.label],
      ...Object.entries(activeNode.locals),
      ["status", activeNode.status],
    ];

    if (Object.prototype.hasOwnProperty.call(activeNode, "returnValue")) {
      rows.push(["returnValue", activeNode.returnValue]);
    }

    elements.activeFrameTable.innerHTML = rows
      .map(
        ([name, value]) => `
          <dl class="variable-row">
            <dt>${escapeHtml(name)}</dt>
            <dd>${escapeHtml(formatValue(value))}</dd>
          </dl>
        `
      )
      .join("");
  }

  if (!stackIds.length) {
    elements.callStack.innerHTML = `<div class="empty-state">The stack is empty after the final return.</div>`;
  } else {
    elements.callStack.innerHTML = [...stackIds]
      .reverse()
      .map((id, offset) => {
        const frame = step.nodes[id];
        return `
          <div class="stack-frame ${offset === 0 ? "current" : ""}">
            <strong>${escapeHtml(frame.label)}</strong>
            <span>${escapeHtml(summarizeLocals(frame.locals) || "No locals tracked yet")}</span>
          </div>
        `;
      })
      .join("");
  }
}

function renderSourceViewer(source, activeLineNo) {
  const lines = source.split("\n");
  elements.codeMeta.textContent = `Python | ${lines.length} lines`;
  elements.codeViewer.innerHTML = lines
    .map(
      (line, index) => `
        <div class="code-line ${activeLineNo === index + 1 ? "active" : ""}">
          <span class="line-number">${index + 1}</span>
          <code>${escapeHtml(line || " ")}</code>
        </div>
      `
    )
    .join("");
}

function renderTimeline() {
  elements.timelineTrack.innerHTML = state.trace.steps
    .map((step) => {
      const classes = [
        "timeline-step",
        step.index === state.stepIndex ? "current" : "",
        step.index < state.stepIndex ? "done" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button type="button" class="${classes}" data-step-index="${step.index}">
          <small>Step ${step.index + 1}</small>
          <strong>${escapeHtml(step.title)}</strong>
          <span>${escapeHtml(truncate(step.explanation, 98))}</span>
        </button>
      `;
    })
    .join("");

  elements.timelineTrack.querySelectorAll("[data-step-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setStep(Number(button.dataset.stepIndex));
    });
  });
}

function getCurrentStep() {
  return state.trace.steps[state.stepIndex];
}

function buildTraceFromPythonCode(source, invocation) {
  if (!source.trim()) {
    throw new Error("Paste at least one Python recursive function.");
  }

  if (!invocation) {
    throw new Error("Enter a starting call such as fib(5).");
  }

  const program = parsePythonProgram(source);
  const invocationAst = parseExpressionText(invocation, 0);
  const tracer = createRuntimeTracer(program.sourceLines);
  const interpreter = createInterpreter(program, tracer);

  let result;
  let runtimeError = "";

  try {
    result = interpreter.evaluateExpression(invocationAst, interpreter.globalScope);
  } catch (error) {
    if (!tracer.events.length) {
      throw new Error(error.message || "The Python code could not be executed.");
    }
    runtimeError = error.message || "Execution stopped because of an error.";
    result = tracer.lastResult;
  }

  if (!tracer.nodes.length) {
    throw new Error("The starting call did not execute a traced Python function.");
  }

  const trace = finalizeTrace(tracer, source, result);
  trace.runtimeError = runtimeError;
  return trace;
}

function parsePythonProgram(source) {
  const sourceLines = source.split("\n");
  const lines = sourceLines.map((raw, index) => ({
    raw,
    text: raw.trim(),
    indent: countIndent(raw),
    lineNo: index + 1,
  }));

  const functions = {};
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (isIgnorableLine(line)) {
      cursor += 1;
      continue;
    }

    if (line.indent !== 0) {
      throw new Error(`Only top-level function definitions are supported. Problem on line ${line.lineNo}.`);
    }

    const header = parseFunctionHeader(line);
    if (!header) {
      throw new Error(`Only Python def functions are supported. Unexpected line ${line.lineNo}.`);
    }

    const parsed = parseFunctionDefinition(lines, cursor, line.indent, header);
    functions[header.name] = parsed.statement;
    cursor = parsed.nextIndex;
  }

  if (!Object.keys(functions).length) {
    throw new Error("No Python functions were found.");
  }

  return {
    sourceLines,
    functions,
  };
}

function parseFunctionHeader(line) {
  const match = /^def\s+([A-Za-z_]\w*)\s*\(/.exec(line.text);
  if (!match) {
    return null;
  }

  const openParenIndex = line.text.indexOf("(", match[0].length - 1);
  const closeParenIndex = findMatchingBracket(line.text, openParenIndex, "(", ")", line.lineNo);
  const remainder = line.text.slice(closeParenIndex + 1).trim();
  if (!/^(?:->\s*.+)?\s*:\s*$/.test(remainder)) {
    return null;
  }

  return {
    name: match[1],
    params: parseParameters(line.text.slice(openParenIndex + 1, closeParenIndex), line.lineNo),
  };
}

function parseParameters(text, lineNo) {
  if (!text.trim()) {
    return [];
  }

  return splitTopLevel(text, ",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const equalsIndex = findTopLevelEquals(part);
      const definitionText = equalsIndex === -1 ? part : part.slice(0, equalsIndex).trim();
      const colonIndex = findTopLevelChar(definitionText, ":");
      const name = (colonIndex === -1 ? definitionText : definitionText.slice(0, colonIndex)).trim();

      validateIdentifier(name, lineNo);
      const isImplicitReceiver = isImplicitReceiverName(name);

      if (equalsIndex === -1) {
        return { name, defaultExpr: null, isImplicitReceiver };
      }

      const defaultText = part.slice(equalsIndex + 1).trim();
      return {
        name,
        defaultExpr: parseExpressionText(defaultText, lineNo),
        isImplicitReceiver,
      };
    });
}

function isImplicitReceiverName(name) {
  return name === "self" || name === "cls";
}

function parseFunctionDefinition(lines, index, indent, existingHeader = null) {
  const line = lines[index];
  const header = existingHeader || parseFunctionHeader(line);
  if (!header) {
    return null;
  }

  const block = parseIndentedBlock(lines, index + 1, indent, line.lineNo);
  return {
    statement: {
      type: "def",
      name: header.name,
      params: header.params,
      lineNo: line.lineNo,
      code: line.raw,
      body: block.statements,
      endLine: block.endLine || line.lineNo,
    },
    nextIndex: block.nextIndex,
  };
}

function parseIndentedBlock(lines, startIndex, parentIndent, parentLineNo) {
  let cursor = startIndex;

  while (cursor < lines.length && isIgnorableLine(lines[cursor])) {
    cursor += 1;
  }

  if (cursor >= lines.length || lines[cursor].indent <= parentIndent) {
    throw new Error(`Expected an indented block after line ${parentLineNo}.`);
  }

  const blockIndent = lines[cursor].indent;
  const statements = [];
  let endLine = parentLineNo;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (isIgnorableLine(line)) {
      cursor += 1;
      continue;
    }

    if (line.indent < blockIndent) {
      break;
    }

    if (line.indent > blockIndent) {
      throw new Error(`Unexpected indentation on line ${line.lineNo}.`);
    }

    const parsed = parseStatement(lines, cursor, blockIndent);
    statements.push(parsed.statement);
    endLine = parsed.statement.endLine || parsed.statement.lineNo;
    cursor = parsed.nextIndex;
  }

  return { statements, nextIndex: cursor, endLine };
}

function parseStatement(lines, index, indent) {
  const line = lines[index];
  const header = parseFunctionHeader(line);

  if (header) {
    return parseFunctionDefinition(lines, index, indent, header);
  }

  if (/^if\s+(.+)\s*:\s*$/.test(line.text)) {
    return parseIfStatement(lines, index, indent);
  }

  if (/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)\s*:\s*$/.test(line.text)) {
    return parseForStatement(lines, index, indent);
  }

  const returnMatch = /^return(?:\s+(.*))?$/.exec(line.text);
  if (returnMatch) {
    return {
      statement: {
        type: "return",
        lineNo: line.lineNo,
        code: line.raw,
        expression: returnMatch[1] ? parseExpressionText(returnMatch[1], line.lineNo) : null,
        endLine: line.lineNo,
      },
      nextIndex: index + 1,
    };
  }

  if (line.text === "pass") {
    return {
      statement: {
        type: "pass",
        lineNo: line.lineNo,
        code: line.raw,
        endLine: line.lineNo,
      },
      nextIndex: index + 1,
    };
  }

  const assignment = parseAssignmentLine(line.text);
  if (assignment) {
    return {
      statement: {
        type: "assign",
        lineNo: line.lineNo,
        code: line.raw,
        name: assignment.name,
        expression: parseExpressionText(assignment.expression, line.lineNo),
        endLine: line.lineNo,
      },
      nextIndex: index + 1,
    };
  }

  return {
    statement: {
      type: "expr",
      lineNo: line.lineNo,
      code: line.raw,
      expression: parseExpressionText(line.text, line.lineNo),
      endLine: line.lineNo,
    },
    nextIndex: index + 1,
  };
}

function parseForStatement(lines, index, indent) {
  const line = lines[index];
  const match = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+)\s*:\s*$/.exec(line.text);
  if (!match) {
    throw new Error(`Could not parse the for loop on line ${line.lineNo}.`);
  }

  const block = parseIndentedBlock(lines, index + 1, indent, line.lineNo);
  return {
    statement: {
      type: "for",
      lineNo: line.lineNo,
      code: line.raw,
      target: match[1],
      iterable: parseExpressionText(match[2], line.lineNo),
      body: block.statements,
      endLine: block.endLine || line.lineNo,
    },
    nextIndex: block.nextIndex,
  };
}

function parseIfStatement(lines, index, indent) {
  const branches = [];
  let cursor = index;
  let endLine = lines[index].lineNo;
  let elseBody = null;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const isFirst = branches.length === 0;
    const pattern = isFirst ? /^if\s+(.+)\s*:\s*$/ : /^elif\s+(.+)\s*:\s*$/;
    const match = pattern.exec(line.text);
    if (!match) {
      break;
    }

    const block = parseIndentedBlock(lines, cursor + 1, indent, line.lineNo);
    branches.push({
      lineNo: line.lineNo,
      code: line.raw,
      test: parseExpressionText(match[1], line.lineNo),
      body: block.statements,
    });
    endLine = block.endLine;
    cursor = block.nextIndex;

    let lookahead = cursor;
    while (lookahead < lines.length && isIgnorableLine(lines[lookahead])) {
      lookahead += 1;
    }

    if (
      lookahead < lines.length &&
      lines[lookahead].indent === indent &&
      /^elif\s+(.+)\s*:\s*$/.test(lines[lookahead].text)
    ) {
      cursor = lookahead;
      continue;
    }

    if (
      lookahead < lines.length &&
      lines[lookahead].indent === indent &&
      lines[lookahead].text === "else:"
    ) {
      const elseBlock = parseIndentedBlock(lines, lookahead + 1, indent, lines[lookahead].lineNo);
      elseBody = {
        lineNo: lines[lookahead].lineNo,
        code: lines[lookahead].raw,
        body: elseBlock.statements,
      };
      endLine = elseBlock.endLine;
      cursor = elseBlock.nextIndex;
      break;
    }

    cursor = lookahead;
    break;
  }

  return {
    statement: {
      type: "if",
      lineNo: lines[index].lineNo,
      code: lines[index].raw,
      branches,
      elseBody,
      endLine,
    },
    nextIndex: cursor,
  };
}

function parseAssignmentLine(text) {
  const equalsIndex = findTopLevelEquals(text);
  if (equalsIndex === -1) {
    return null;
  }

  const name = text.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return null;
  }

  return {
    name,
    expression: text.slice(equalsIndex + 1).trim(),
  };
}

function parseExpressionText(text, lineNo) {
  const parser = new ExpressionParser(tokenizeExpression(text, lineNo), lineNo);
  return parser.parse();
}

class ExpressionParser {
  constructor(tokens, lineNo) {
    this.tokens = tokens;
    this.lineNo = lineNo;
    this.index = 0;
  }

  parse() {
    const expression = this.parseOr();
    if (!this.isAtEnd()) {
      throw new Error(`Could not parse the Python expression on line ${this.lineNo}.`);
    }
    return expression;
  }

  parseOr() {
    let node = this.parseAnd();
    while (this.matchValue("or")) {
      node = {
        type: "binary",
        op: "or",
        left: node,
        right: this.parseAnd(),
      };
    }
    return node;
  }

  parseAnd() {
    let node = this.parseNot();
    while (this.matchValue("and")) {
      node = {
        type: "binary",
        op: "and",
        left: node,
        right: this.parseNot(),
      };
    }
    return node;
  }

  parseNot() {
    if (this.matchValue("not")) {
      return {
        type: "unary",
        op: "not",
        argument: this.parseNot(),
      };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let node = this.parseAdditive();
    const comparisons = [];

    while (this.matchValue("==", "!=", "<", ">", "<=", ">=")) {
      comparisons.push({
        op: this.previous().value,
        right: this.parseAdditive(),
      });
    }

    if (!comparisons.length) {
      return node;
    }

    return {
      type: "compare",
      left: node,
      comparisons,
    };
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.matchValue("+", "-")) {
      node = {
        type: "binary",
        op: this.previous().value,
        left: node,
        right: this.parseMultiplicative(),
      };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (this.matchValue("*", "/", "//", "%")) {
      node = {
        type: "binary",
        op: this.previous().value,
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  parseUnary() {
    if (this.matchValue("-", "+")) {
      return {
        type: "unary",
        op: this.previous().value,
        argument: this.parseUnary(),
      };
    }
    return this.parsePower();
  }

  parsePower() {
    let node = this.parsePostfix();
    if (this.matchValue("**")) {
      node = {
        type: "binary",
        op: "**",
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  parsePostfix() {
    let node = this.parsePrimary();

    while (true) {
      if (this.matchValue(".")) {
        const name = this.consumeName("Expected an attribute name after '.'.");
        node = {
          type: "attribute",
          object: node,
          name,
          lineNo: this.lineNo,
        };
        continue;
      }

      if (this.matchValue("(")) {
        const args = [];
        if (!this.checkValue(")")) {
          do {
            args.push(this.parseOr());
          } while (this.matchValue(","));
        }
        this.consumeValue(")", "Expected ')' after function arguments.");
        node = { type: "call", callee: node, args };
        continue;
      }

      if (this.matchValue("[")) {
        const indexExpression = this.parseOr();
        this.consumeValue("]", "Expected ']' after index expression.");
        node = {
          type: "index",
          object: node,
          index: indexExpression,
        };
        continue;
      }

      break;
    }

    return node;
  }

  parsePrimary() {
    if (this.matchType("number")) {
      return {
        type: "literal",
        value: Number(this.previous().value),
      };
    }

    if (this.matchType("string")) {
      return {
        type: "literal",
        value: this.previous().value,
      };
    }

    if (this.matchType("name")) {
      const value = this.previous().value;
      if (value === "True") {
        return { type: "literal", value: true };
      }
      if (value === "False") {
        return { type: "literal", value: false };
      }
      if (value === "None") {
        return { type: "literal", value: null };
      }
      return {
        type: "name",
        name: value,
      };
    }

    if (this.matchValue("(")) {
      const expression = this.parseOr();
      this.consumeValue(")", "Expected ')' after expression.");
      return expression;
    }

    if (this.matchValue("[")) {
      if (this.checkValue("]")) {
        this.consumeValue("]", "Expected ']' after list literal.");
        return {
          type: "list",
          items: [],
        };
      }

      const firstItem = this.parseOr();
      if (this.matchValue("for")) {
        const target = this.consumeName("Expected a variable name in the list comprehension.");
        this.consumeValue("in", "Expected 'in' in the list comprehension.");
        const iterable = this.parseOr();
        this.consumeValue("]", "Expected ']' after the list comprehension.");
        return {
          type: "list_comp",
          target,
          iterable,
          expression: firstItem,
        };
      }

      const items = [firstItem];
      while (this.matchValue(",")) {
        if (this.checkValue("]")) {
          break;
        }
        items.push(this.parseOr());
      }
      this.consumeValue("]", "Expected ']' after list literal.");
      return {
        type: "list",
        items,
      };
    }

    throw new Error(`Could not parse the Python expression on line ${this.lineNo}.`);
  }

  matchValue(...values) {
    if (this.isAtEnd()) {
      return false;
    }
    const token = this.peek();
    if ((token.type === "string" || token.type === "number") || !values.includes(token.value)) {
      return false;
    }
    this.index += 1;
    return true;
  }

  matchType(type) {
    if (this.isAtEnd()) {
      return false;
    }
    if (this.peek().type !== type) {
      return false;
    }
    this.index += 1;
    return true;
  }

  consumeValue(value, message) {
    if (this.matchValue(value)) {
      return;
    }
    throw new Error(message);
  }

  consumeName(message) {
    if (this.matchType("name")) {
      return this.previous().value;
    }
    throw new Error(message);
  }

  checkValue(value) {
    if (this.isAtEnd()) {
      return false;
    }
    const token = this.peek();
    return token.type !== "string" && token.type !== "number" && token.value === value;
  }

  previous() {
    return this.tokens[this.index - 1];
  }

  peek() {
    return this.tokens[this.index];
  }

  isAtEnd() {
    return this.index >= this.tokens.length;
  }
}

function tokenizeExpression(text, lineNo) {
  const tokens = [];
  let cursor = 0;

  while (cursor < text.length) {
    const char = text[cursor];
    const nextTwo = text.slice(cursor, cursor + 2);

    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }

    if (char === "#") {
      break;
    }

    if (char === "'" || char === '"') {
      const parsedString = readQuotedString(text, cursor, char, lineNo);
      tokens.push({
        type: "string",
        value: parsedString.value,
      });
      cursor = parsedString.nextIndex;
      continue;
    }

    if (/\d/.test(char)) {
      let end = cursor + 1;
      while (end < text.length && /[\d.]/.test(text[end])) {
        end += 1;
      }
      tokens.push({
        type: "number",
        value: text.slice(cursor, end),
      });
      cursor = end;
      continue;
    }

    if (["==", "!=", "<=", ">=", "//", "**"].includes(nextTwo)) {
      tokens.push({
        type: "op",
        value: nextTwo,
      });
      cursor += 2;
      continue;
    }

    if ("+-*/%()[],<>.".includes(char)) {
      tokens.push({
        type: "op",
        value: char,
      });
      cursor += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = cursor + 1;
      while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
        end += 1;
      }
      tokens.push({
        type: "name",
        value: text.slice(cursor, end),
      });
      cursor = end;
      continue;
    }

    throw new Error(`Unsupported character '${char}' on line ${lineNo}.`);
  }

  return tokens;
}

function createInterpreter(program, tracer) {
  const globalScope = {
    locals: {},
    parent: null,
    frameId: null,
  };

  Object.values(program.functions).forEach((fn) => {
    globalScope.locals[fn.name] = createUserFunctionValue(fn, globalScope);
  });

  return {
    globalScope,
    evaluateExpression(node, scope = globalScope) {
      switch (node.type) {
        case "literal":
          return cloneValue(node.value);
        case "name":
          return resolveName(node.name, scope);
        case "attribute":
          return resolveAttributeValue(this.evaluateExpression(node.object, scope), node.name, node.lineNo);
        case "list":
          return node.items.map((item) => this.evaluateExpression(item, scope));
        case "list_comp":
          return evaluateListComprehension(node, scope, this);
        case "unary":
          return applyUnaryOperator(node.op, this.evaluateExpression(node.argument, scope));
        case "binary":
          return applyBinaryOperator(
            node.op,
            this.evaluateExpression(node.left, scope),
            () => this.evaluateExpression(node.right, scope)
          );
        case "compare":
          return evaluateComparison(node, scope, this);
        case "index": {
          const target = this.evaluateExpression(node.object, scope);
          const index = this.evaluateExpression(node.index, scope);
          return target[index];
        }
        case "call": {
          const callee = this.evaluateExpression(node.callee, scope);
          const args = node.args.map((arg) => this.evaluateExpression(arg, scope));
          return callValue(callee, args, scope, this, program, tracer);
        }
        default:
          throw new Error("Unsupported Python expression.");
      }
    },
    executeFunction(name, args) {
      const callee = globalScope.locals[name];
      if (!callee || callee.kind !== "user_function") {
        throw new Error(`Function '${name}' is not defined.`);
      }
      return this.executeFunctionValue(callee, args);
    },
    executeFunctionValue(callee, args) {
      const fn = callee.fn;
      if (!fn) {
        throw new Error("The requested function is not available.");
      }

      const closureScope = callee.closure || globalScope;
      const locals = bindArguments(fn, args, this, closureScope);
      let frameId = null;

      try {
        frameId = tracer.enter(fn.name, locals, fn.lineNo);
        const scope = {
          locals,
          parent: closureScope,
          frameId,
          functionName: fn.name,
        };
        const outcome = executeStatements(fn.body, scope, this, tracer);
        if (outcome && outcome.returned) {
          return tracer.returnFrame(frameId, outcome.lineNo, outcome.value, locals);
        }
        return tracer.returnFrame(frameId, fn.endLine, null, locals);
      } catch (error) {
        if (frameId !== null) {
          tracer.errorFrame(frameId, error.lineNo || fn.lineNo, error, locals);
        }
        throw error;
      }
    },
  };
}

function executeStatements(statements, scope, interpreter, tracer) {
  for (const statement of statements) {
    const outcome = executeStatement(statement, scope, interpreter, tracer);
    if (outcome && outcome.returned) {
      return outcome;
    }
  }
  return null;
}

function executeStatement(statement, scope, interpreter, tracer) {
  switch (statement.type) {
    case "def": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      scope.locals[statement.name] = createUserFunctionValue(statement, scope);
      tracer.capture(
        scope.frameId,
        statement.lineNo,
        scope.locals,
        statement.code,
        `Defined ${statement.name}() inside the current frame so it can be called next.`
      );
      return null;
    }
    case "assign": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      const value = interpreter.evaluateExpression(statement.expression, scope);
      scope.locals[statement.name] = value;
      tracer.capture(
        scope.frameId,
        statement.lineNo,
        scope.locals,
        statement.code,
        `${statement.name} now stores ${formatValue(sanitizeValue(value))}.`
      );
      return null;
    }
    case "expr": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      const value = interpreter.evaluateExpression(statement.expression, scope);
      tracer.capture(
        scope.frameId,
        statement.lineNo,
        scope.locals,
        statement.code,
        `Line ${statement.lineNo} finished with ${formatValue(sanitizeValue(value))}.`
      );
      return null;
    }
    case "pass": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      tracer.capture(
        scope.frameId,
        statement.lineNo,
        scope.locals,
        statement.code,
        "pass does not change any variable."
      );
      return null;
    }
    case "return": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      const value = statement.expression
        ? interpreter.evaluateExpression(statement.expression, scope)
        : null;
      return {
        returned: true,
        value,
        lineNo: statement.lineNo,
      };
    }
    case "if": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      let chosenBranch = null;
      let detail = "All conditions were false.";

      for (const branch of statement.branches) {
        if (interpreter.evaluateExpression(branch.test, scope)) {
          chosenBranch = branch;
          detail =
            branch.lineNo === statement.lineNo
              ? "The if condition is true, so the indented branch runs next."
              : "An elif condition is true, so that branch runs next.";
          break;
        }
      }

      if (!chosenBranch && statement.elseBody) {
        detail = "No condition matched, so the else branch runs next.";
      }

      tracer.capture(scope.frameId, statement.lineNo, scope.locals, statement.code, detail);

      if (chosenBranch) {
        return executeStatements(chosenBranch.body, scope, interpreter, tracer);
      }

      if (statement.elseBody) {
        return executeStatements(statement.elseBody.body, scope, interpreter, tracer);
      }
      return null;
    }
    case "for": {
      tracer.hit(scope.frameId, statement.lineNo, scope.locals, statement.code);
      const iterable = interpreter.evaluateExpression(statement.iterable, scope);
      const items = toIterableArray(iterable, statement.lineNo);
      tracer.capture(
        scope.frameId,
        statement.lineNo,
        scope.locals,
        statement.code,
        items.length
          ? `The loop will run ${items.length} time${items.length === 1 ? "" : "s"} in order.`
          : "The loop has no items, so the body is skipped."
      );

      for (let index = 0; index < items.length; index += 1) {
        scope.locals[statement.target] = items[index];
        tracer.capture(
          scope.frameId,
          statement.lineNo,
          scope.locals,
          statement.code,
          `Iteration ${index + 1}: ${statement.target} = ${formatValue(
            sanitizeValue(items[index])
          )}.`
        );
        const outcome = executeStatements(statement.body, scope, interpreter, tracer);
        if (outcome && outcome.returned) {
          return outcome;
        }
      }
      return null;
    }
    default:
      throw new Error("Unsupported Python statement.");
  }
}

function bindArguments(fn, args, interpreter, closureScope) {
  const normalizedArgs = normalizeFunctionArguments(fn, args);
  if (normalizedArgs.length > fn.params.length) {
    throw new Error(`Too many arguments were passed to ${fn.name}().`);
  }

  const locals = {};
  const defaultScope = {
    locals,
    parent: closureScope,
    frameId: null,
  };

  fn.params.forEach((param, index) => {
    if (index < normalizedArgs.length) {
      locals[param.name] = normalizedArgs[index];
      return;
    }

    if (param.defaultExpr) {
      locals[param.name] = interpreter.evaluateExpression(param.defaultExpr, defaultScope);
      return;
    }

    throw new Error(`Missing argument '${param.name}' for ${fn.name}().`);
  });

  return locals;
}

function normalizeFunctionArguments(fn, args) {
  if (!fn.params.length || !fn.params[0].isImplicitReceiver || args.length >= fn.params.length) {
    return args;
  }
  return [createImplicitReceiverValue(fn.params[0].name), ...args];
}

function createImplicitReceiverValue(name) {
  return {
    kind: "implicit_receiver",
    name: name || "self",
  };
}

function resolveName(name, scope) {
  let cursor = scope;
  while (cursor) {
    if (Object.prototype.hasOwnProperty.call(cursor.locals, name)) {
      return cursor.locals[name];
    }
    cursor = cursor.parent;
  }

  if (BUILTIN_FUNCTIONS.has(name)) {
    return { kind: "builtin", name };
  }

  const error = new Error(`Name '${name}' is not defined.`);
  error.lineNo = 0;
  throw error;
}

function resolveAttributeValue(target, name, lineNo) {
  if (Array.isArray(target) || typeof target === "string") {
    return createBoundMethodValue(target, name, lineNo);
  }

  if (target && typeof target === "object" && Object.prototype.hasOwnProperty.call(target, name)) {
    return cloneValue(target[name]);
  }

  const error = new Error(`Attribute '${name}' is not supported on this value.`);
  error.lineNo = lineNo || 0;
  throw error;
}

function createBoundMethodValue(receiver, name, lineNo) {
  return {
    kind: "bound_method",
    receiver,
    name,
    lineNo: lineNo || 0,
  };
}

function callValue(callee, args, scope, interpreter, program, tracer) {
  if (callee && callee.kind === "builtin") {
    return callBuiltin(callee.name, args);
  }

  if (callee && callee.kind === "bound_method") {
    return callBoundMethod(callee, args);
  }

  if (callee && callee.kind === "user_function") {
    return interpreter.executeFunctionValue(callee, args);
  }

  throw new Error("Only traced Python functions and common built-ins are supported in calls.");
}

function callBoundMethod(method, args) {
  if (Array.isArray(method.receiver)) {
    return callListMethod(method, args);
  }

  if (typeof method.receiver === "string") {
    return callStringMethod(method, args);
  }

  const error = new Error(`Method '${method.name}' is not supported on this value.`);
  error.lineNo = method.lineNo || 0;
  throw error;
}

function callListMethod(method, args) {
  switch (method.name) {
    case "append":
      if (args.length !== 1) {
        throwMethodArityError(method.name, 1, args.length, method.lineNo);
      }
      method.receiver.push(args[0]);
      return null;
    case "pop": {
      if (args.length > 1) {
        throwMethodArityError(method.name, "0 or 1", args.length, method.lineNo);
      }
      if (!method.receiver.length) {
        const error = new Error("pop() cannot be used on an empty list.");
        error.lineNo = method.lineNo || 0;
        throw error;
      }
      const rawIndex = args.length ? args[0] : method.receiver.length - 1;
      const index = normalizeListIndex(rawIndex, method.receiver.length, method.lineNo);
      return method.receiver.splice(index, 1)[0];
    }
    case "sort":
      if (args.length !== 0) {
        throwMethodArityError(method.name, 0, args.length, method.lineNo);
      }
      sortPythonValuesInPlace(method.receiver, method.lineNo);
      return null;
    default: {
      const error = new Error(`List method '${method.name}' is not supported yet.`);
      error.lineNo = method.lineNo || 0;
      throw error;
    }
  }
}

function callStringMethod(method, args) {
  switch (method.name) {
    case "join": {
      if (args.length !== 1) {
        throwMethodArityError(method.name, 1, args.length, method.lineNo);
      }
      const items = toIterableArray(args[0], method.lineNo);
      if (!items.every((item) => typeof item === "string")) {
        const error = new Error("str.join() expects an iterable of strings.");
        error.lineNo = method.lineNo || 0;
        throw error;
      }
      return items.join(method.receiver);
    }
    default: {
      const error = new Error(`String method '${method.name}' is not supported yet.`);
      error.lineNo = method.lineNo || 0;
      throw error;
    }
  }
}

function throwMethodArityError(name, expected, received, lineNo) {
  const error = new Error(`${name}() expects ${expected} argument${expected === 1 ? "" : "s"}, received ${received}.`);
  error.lineNo = lineNo || 0;
  throw error;
}

function normalizeListIndex(value, length, lineNo) {
  if (!Number.isInteger(value)) {
    const error = new Error("List indices must be integers.");
    error.lineNo = lineNo || 0;
    throw error;
  }

  const normalized = value < 0 ? length + value : value;
  if (normalized < 0 || normalized >= length) {
    const error = new Error("pop() index is out of range.");
    error.lineNo = lineNo || 0;
    throw error;
  }
  return normalized;
}

function createRuntimeTracer(sourceLines) {
  const nodes = [];
  const nodeMap = {};
  const stack = [];
  const events = [];
  let nextId = 1;

  return {
    nodes,
    nodeMap,
    events,
    lastResult: undefined,
    enter(name, rawLocals, lineNo) {
      if (nodes.length >= MAX_CALL_COUNT) {
        throw new Error(`Stopped after ${MAX_CALL_COUNT} calls to keep the page responsive.`);
      }

      const locals = sanitizeLocals(rawLocals);
      const id = nextId++;
      const parentId = stack.length ? stack[stack.length - 1] : null;
      const label = formatCallLabel(name, locals);
      const node = {
        id,
        name,
        label,
        parentId,
        children: [],
        depth: stack.length,
        latestLocals: cloneValue(locals),
        createdStep: events.length,
      };

      nodes.push(node);
      nodeMap[id] = node;
      if (parentId !== null) {
        nodeMap[parentId].children.push(id);
      }

      stack.push(id);
      events.push({
        kind: "call",
        frameId: id,
        parentId,
        lineNo,
        codeText: sourceLines[lineNo - 1] || "",
        locals,
        changes: diffLocals({}, locals),
      });
      return id;
    },
    hit(frameId, lineNo, rawLocals, codeText) {
      this.pushGuard();
      events.push({
        kind: "line",
        phase: "before",
        frameId,
        lineNo,
        codeText,
        locals: sanitizeLocals(rawLocals),
        changes: [],
        detail: "",
      });
    },
    capture(frameId, lineNo, rawLocals, codeText, detail) {
      this.pushGuard();
      const node = nodeMap[frameId];
      const locals = sanitizeLocals(rawLocals);
      const changes = diffLocals(node.latestLocals || {}, locals);
      node.latestLocals = cloneValue(locals);
      events.push({
        kind: "line",
        phase: "after",
        frameId,
        lineNo,
        codeText,
        locals,
        changes,
        detail: detail || "",
      });
    },
    returnFrame(frameId, lineNo, value, rawLocals) {
      this.pushGuard();
      const node = nodeMap[frameId];
      const locals = sanitizeLocals(rawLocals);
      const cleanValue = sanitizeValue(value);
      const changes = diffLocals(node.latestLocals || {}, locals);
      node.latestLocals = cloneValue(locals);
      node.returnValue = cloneValue(cleanValue);
      this.lastResult = cloneValue(cleanValue);
      removeFrame(stack, frameId);
      events.push({
        kind: "return",
        frameId,
        lineNo,
        codeText: sourceLines[lineNo - 1] || "",
        locals,
        changes,
        returnValue: cleanValue,
      });
      return value;
    },
    errorFrame(frameId, lineNo, error, rawLocals) {
      const node = nodeMap[frameId];
      const locals = sanitizeLocals(rawLocals);
      node.latestLocals = cloneValue(locals);
      removeFrame(stack, frameId);
      events.push({
        kind: "error",
        frameId,
        lineNo,
        codeText: sourceLines[Math.max(lineNo - 1, 0)] || "",
        locals,
        changes: [],
        message: error && error.message ? error.message : String(error),
      });
      return error;
    },
    pushGuard() {
      if (events.length >= MAX_EVENT_COUNT) {
        throw new Error(`Stopped after ${MAX_EVENT_COUNT} trace steps to keep the page responsive.`);
      }
    },
  };
}

function finalizeTrace(tracer, source, result) {
  const layout = computeAcademicLayout(tracer.nodes);
  const steps = replayEvents(tracer.nodes, tracer.events, source.split("\n"));
  const rootLabels = tracer.nodes
    .filter((node) => node.parentId === null)
    .map((node) => node.label);

  return {
    source,
    result: sanitizeValue(result),
    nodes: tracer.nodes,
    nodeMap: Object.fromEntries(tracer.nodes.map((node) => [node.id, node])),
    steps,
    rootLabels,
    layout,
    meta: {
      callCount: tracer.nodes.length,
      maxDepth: Math.max(0, ...tracer.nodes.map((node) => node.depth)),
    },
  };
}

function replayEvents(nodes, events, sourceLines) {
  const states = {};
  const stack = [];

  nodes.forEach((node) => {
    states[node.id] = {
      id: node.id,
      label: node.label,
      parentId: node.parentId,
      visible: false,
      locals: {},
      status: "hidden",
    };
  });

  return events.map((event, index) => {
    const nodeState = states[event.frameId];
    let activeNodeId = event.frameId;

    if (event.kind === "call") {
      nodeState.visible = true;
      nodeState.locals = cloneValue(event.locals);
      nodeState.status = "active";
      stack.push(event.frameId);
      if (event.parentId !== null && states[event.parentId].visible) {
        states[event.parentId].status = "waiting";
      }
    }

    if (event.kind === "line") {
      nodeState.visible = true;
      nodeState.locals = cloneValue(event.locals);
      nodeState.status = "active";
    }

    if (event.kind === "return") {
      nodeState.visible = true;
      nodeState.locals = cloneValue(event.locals);
      nodeState.returnValue = cloneValue(event.returnValue);
      nodeState.status = "returned";
      removeFrame(stack, event.frameId);
      if (stack.length) {
        states[stack[stack.length - 1]].status = "active";
      }
    }

    if (event.kind === "error") {
      nodeState.visible = true;
      nodeState.locals = cloneValue(event.locals);
      nodeState.status = "error";
      removeFrame(stack, event.frameId);
    }

    const snapshot = {
      index,
      activeNodeId,
      lineNo: event.lineNo ?? null,
      stack: [...stack],
      changes: event.changes || [],
      eventKind: event.kind,
      eventFrameId: event.frameId,
      title: describeStepTitle(event, states[event.frameId]),
      explanation: describeStepExplanation(event, sourceLines, states[event.frameId]),
      nodes: cloneValue(states),
    };

    if (event.kind === "return" && !snapshot.stack.length) {
      snapshot.activeNodeId = event.frameId;
    }

    return snapshot;
  });
}

function computeAcademicLayout(nodes) {
  if (!nodes.length) {
    return {
      width: TREE_MIN_CANVAS_WIDTH,
      height: TREE_MIN_CANVAS_HEIGHT,
    };
  }

  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const roots = nodes.filter((node) => node.parentId === null);
  const maxDepth = Math.max(0, ...nodes.map((node) => node.depth));
  const siblingGap = clamp(30 - nodes.length * 0.24, 8, 20);
  const rootGap = siblingGap + 12;
  const verticalGap = clamp(102 - maxDepth * 4, 70, 92);
  const sidePadding = 28;
  const topPadding = 76;
  const bottomPadding = 80;

  function measureSubtree(nodeId) {
    const node = nodeMap[nodeId];
    node.labelWidth = getNodeLabelWidth(node.label);
    node.selfWidth = node.labelWidth + 16;

    if (!node.children.length) {
      node.subtreeWidth = node.selfWidth;
      return node.subtreeWidth;
    }

    const childWidths = node.children.map((childId) => measureSubtree(childId));
    const childrenWidth =
      childWidths.reduce((sum, width) => sum + width, 0) +
      siblingGap * Math.max(0, childWidths.length - 1);
    node.subtreeWidth = Math.max(node.selfWidth, childrenWidth);
    node.childrenWidth = childrenWidth;
    return node.subtreeWidth;
  }

  roots.forEach((root) => measureSubtree(root.id));

  function positionSubtree(nodeId, left, depth) {
    const node = nodeMap[nodeId];
    node.x = left + node.subtreeWidth / 2;
    node.y = topPadding + depth * verticalGap;

    if (!node.children.length) {
      return;
    }

    let childLeft = left + (node.subtreeWidth - node.childrenWidth) / 2;
    node.children.forEach((childId) => {
      const child = nodeMap[childId];
      positionSubtree(childId, childLeft, depth + 1);
      childLeft += child.subtreeWidth + siblingGap;
    });
  }

  let cursorX = sidePadding;
  roots.forEach((root, index) => {
    positionSubtree(root.id, cursorX, 0);
    cursorX += nodeMap[root.id].subtreeWidth;
    if (index < roots.length - 1) {
      cursorX += rootGap;
    }
  });

  return {
    width: Math.max(TREE_MIN_CANVAS_WIDTH, cursorX + sidePadding),
    height: Math.max(TREE_MIN_CANVAS_HEIGHT, topPadding + maxDepth * verticalGap + bottomPadding),
  };
}

function getNodeLabelWidth(label) {
  return Math.max(70, String(label || "").length * 8 + 18);
}

function buildReturnArrow(node, parent) {
  const direction = node.x >= parent.x ? 1 : -1;
  const childWidth = getNodeLabelWidth(node.label);
  const parentWidth = getNodeLabelWidth(parent.label);
  const startX = node.x + direction * (childWidth / 2 + 8);
  const startY = node.y - 12;
  const bendOffset = clamp(Math.abs(parent.x - node.x) * 0.16, 18, 36);
  const bendX = startX + direction * bendOffset;
  const endX = parent.x + direction * (parentWidth / 2 + 10);
  const endY = parent.y - 14;
  const labelX = bendX + direction * 12;
  const labelY = (startY + endY) / 2 - 8;

  return {
    path: `M ${startX} ${startY} L ${bendX} ${startY} L ${bendX} ${endY} L ${endX} ${endY}`,
    labelX,
    labelY,
    textAnchor: direction === 1 ? "start" : "end",
  };
}

function describeStepTitle(event, nodeState) {
  if (event.kind === "call") {
    return `Call ${nodeState.label}`;
  }

  if (event.kind === "return") {
    return `Return from ${nodeState.label}`;
  }

  if (event.kind === "error") {
    return `Error in ${nodeState.label}`;
  }

  if (event.phase === "before") {
    return `Run line ${event.lineNo}`;
  }

  return `Finish line ${event.lineNo}`;
}

function describeStepExplanation(event, sourceLines, nodeState) {
  const codeText = (sourceLines[event.lineNo - 1] || "").trim();

  if (event.kind === "call") {
    return `A new recursive frame was created for ${nodeState.label}, so a new node appears in the tree.`;
  }

  if (event.kind === "return") {
    return `${nodeState.label} finished on line ${event.lineNo} and returned ${formatValue(
      event.returnValue
    )}.`;
  }

  if (event.kind === "error") {
    return `${nodeState.label} stopped because of: ${event.message}.`;
  }

  if (event.phase === "before") {
    return codeText
      ? `About to execute line ${event.lineNo}: ${codeText}`
      : `About to execute line ${event.lineNo}.`;
  }

  if (event.detail) {
    return event.detail;
  }

  if (!event.changes.length) {
    return codeText
      ? `Line ${event.lineNo} finished without a tracked variable change: ${codeText}`
      : `Line ${event.lineNo} finished without a tracked variable change.`;
  }

  const changeSummary = event.changes
    .map((change) => `${change.name} -> ${formatValue(change.to)}`)
    .join(", ");
  return `Line ${event.lineNo} finished and updated ${changeSummary}.`;
}

function countIndent(raw) {
  const match = raw.match(/^\s*/);
  return (match ? match[0] : "").replace(/\t/g, "    ").length;
}

function isIgnorableLine(line) {
  return !line.text || line.text.startsWith("#");
}

function findTopLevelEquals(text) {
  let depth = 0;
  let quote = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    const next = text[index + 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (
      char === "=" &&
      depth === 0 &&
      previous !== "=" &&
      previous !== "!" &&
      previous !== "<" &&
      previous !== ">" &&
      next !== "="
    ) {
      return index;
    }
  }

  return -1;
}

function findTopLevelChar(text, targetChar) {
  let depth = 0;
  let quote = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === targetChar && depth === 0) {
      return index;
    }
  }

  return -1;
}

function findMatchingBracket(text, startIndex, openChar, closeChar, lineNo) {
  let depth = 0;
  let quote = "";

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Could not find the matching '${closeChar}' on line ${lineNo}.`);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") {
        quote = "";
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function validateIdentifier(name, lineNo) {
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    throw new Error(`Invalid identifier '${name}' on line ${lineNo}.`);
  }
}

function readQuotedString(text, startIndex, quote, lineNo) {
  let cursor = startIndex + 1;
  let value = "";

  while (cursor < text.length) {
    const char = text[cursor];
    const next = text[cursor + 1];

    if (char === "\\") {
      if (next === "n") {
        value += "\n";
      } else if (next === "t") {
        value += "\t";
      } else {
        value += next;
      }
      cursor += 2;
      continue;
    }

    if (char === quote) {
      return { value, nextIndex: cursor + 1 };
    }

    value += char;
    cursor += 1;
  }

  throw new Error(`Unterminated string on line ${lineNo}.`);
}

function createUserFunctionValue(fn, closure) {
  return {
    kind: "user_function",
    fn,
    closure,
  };
}

function evaluateListComprehension(node, scope, interpreter) {
  const iterable = interpreter.evaluateExpression(node.iterable, scope);
  const items = toIterableArray(iterable, 0);
  const output = [];

  items.forEach((item) => {
    const comprehensionScope = {
      locals: {
        [node.target]: item,
      },
      parent: scope,
      frameId: scope.frameId,
    };
    output.push(interpreter.evaluateExpression(node.expression, comprehensionScope));
  });

  return output;
}

function toIterableArray(value, lineNo) {
  if (Array.isArray(value)) {
    return value.slice();
  }

  if (typeof value === "string") {
    return Array.from(value);
  }

  const error = new Error(
    lineNo
      ? `Line ${lineNo} expected something iterable for the loop or comprehension.`
      : "An iterable value was expected."
  );
  error.lineNo = lineNo || 0;
  throw error;
}

function callBuiltin(name, args) {
  switch (name) {
    case "len":
      if (args.length !== 1) {
        throw new Error("len() expects exactly one argument.");
      }
      return args[0].length;
    case "range":
      return builtinRange(args);
    case "int":
      if (args.length !== 1) {
        throw new Error("int() expects exactly one argument.");
      }
      return Math.trunc(Number(args[0]));
    case "float":
      if (args.length !== 1) {
        throw new Error("float() expects exactly one argument.");
      }
      return builtinFloat(args[0]);
    case "min":
      return builtinExtrema("min", args);
    case "max":
      return builtinExtrema("max", args);
    case "sum":
      return builtinSum(args);
    case "sorted":
      return builtinSorted(args);
    default:
      throw new Error(`The built-in ${name}() is not supported yet.`);
  }
}

function builtinRange(args) {
  if (args.length < 1 || args.length > 3) {
    throw new Error("range() expects one to three arguments.");
  }

  const start = args.length === 1 ? 0 : Number(args[0]);
  const stop = args.length === 1 ? Number(args[0]) : Number(args[1]);
  const step = args.length === 3 ? Number(args[2]) : 1;
  if (step === 0) {
    throw new Error("range() step cannot be zero.");
  }

  const output = [];
  if (step > 0) {
    for (let value = start; value < stop; value += step) {
      output.push(value);
    }
  } else {
    for (let value = start; value > stop; value += step) {
      output.push(value);
    }
  }
  return output;
}

function builtinFloat(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "inf" || normalized === "+inf" || normalized === "infinity") {
      return Number.POSITIVE_INFINITY;
    }
    if (normalized === "-inf" || normalized === "-infinity") {
      return Number.NEGATIVE_INFINITY;
    }
    if (normalized === "nan") {
      return Number.NaN;
    }
  }
  return Number(value);
}

function builtinExtrema(kind, args) {
  const values = args.length === 1 ? normalizeExtremaValues(args[0]) : args;
  if (!values.length) {
    throw new Error(`${kind}() needs at least one value.`);
  }

  return values.slice(1).reduce((best, current) => {
    const comparison = comparePythonValues(current, best);
    if (kind === "min") {
      return comparison < 0 ? current : best;
    }
    return comparison > 0 ? current : best;
  }, values[0]);
}

function builtinSum(args) {
  if (args.length !== 1 || !Array.isArray(args[0])) {
    throw new Error("sum() expects exactly one list argument.");
  }
  return args[0].reduce((total, value) => total + value, 0);
}

function builtinSorted(args) {
  if (args.length !== 1) {
    throw new Error("sorted() expects exactly one iterable argument.");
  }
  const values = toIterableArray(args[0], 0);
  return sortPythonValues(values, 0);
}

function normalizeExtremaValues(value) {
  if (Array.isArray(value) || typeof value === "string") {
    return toIterableArray(value, 0);
  }
  return [value];
}

function sortPythonValues(values, lineNo) {
  return values.slice().sort((left, right) => comparePythonValues(left, right, lineNo));
}

function sortPythonValuesInPlace(values, lineNo) {
  const sorted = sortPythonValues(values, lineNo);
  values.splice(0, values.length, ...sorted);
}

function comparePythonValues(left, right, lineNo = 0) {
  if (typeof left === typeof right && ["number", "string", "boolean"].includes(typeof left)) {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  }

  const error = new Error("Sorting and min/max currently support numbers, strings, or booleans of the same type.");
  error.lineNo = lineNo || 0;
  throw error;
}

function evaluateComparison(node, scope, interpreter) {
  let left = interpreter.evaluateExpression(node.left, scope);

  for (const comparison of node.comparisons) {
    const right = interpreter.evaluateExpression(comparison.right, scope);
    if (!compareValues(left, right, comparison.op)) {
      return false;
    }
    left = right;
  }

  return true;
}

function compareValues(left, right, operator) {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
    default:
      throw new Error(`Unsupported comparison operator '${operator}'.`);
  }
}

function applyUnaryOperator(operator, value) {
  switch (operator) {
    case "-":
      return -value;
    case "+":
      return +value;
    case "not":
      return !value;
    default:
      throw new Error(`Unsupported unary operator '${operator}'.`);
  }
}

function applyBinaryOperator(operator, left, rightReader) {
  if (operator === "and") {
    return left && rightReader();
  }

  if (operator === "or") {
    return left || rightReader();
  }

  const right = rightReader();
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "//":
      return Math.floor(left / right);
    case "%":
      return left % right;
    case "**":
      return left ** right;
    default:
      throw new Error(`Unsupported binary operator '${operator}'.`);
  }
}

function sanitizeLocals(rawLocals) {
  const output = {};
  Object.entries(rawLocals || {}).forEach(([key, value]) => {
    output[key] = sanitizeValue(value);
  });
  return output;
}

function diffLocals(previous, next) {
  const changes = [];
  const keys = dedupe([...Object.keys(previous), ...Object.keys(next)]);

  keys.forEach((key) => {
    const before = Object.prototype.hasOwnProperty.call(previous, key)
      ? previous[key]
      : undefined;
    const after = Object.prototype.hasOwnProperty.call(next, key)
      ? next[key]
      : undefined;
    if (!valuesEqual(before, after)) {
      changes.push({
        name: key,
        from: before,
        to: after,
      });
    }
  });

  return changes;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatCallLabel(name, locals) {
  const values = Object.values(locals).map((value) => formatInlineValue(value));
  return `${name}(${values.join(", ")})`;
}

function removeFrame(stack, frameId) {
  const index = stack.lastIndexOf(frameId);
  if (index >= 0) {
    stack.splice(index, 1);
  }
}

function dedupe(values) {
  return [...new Set(values)];
}

function summarizeLocals(locals) {
  return Object.entries(locals)
    .map(([name, value]) => `${name}=${formatValue(value)}`)
    .join(" | ");
}

function normalizeSource(source) {
  return String(source || "").replace(/\r\n?/g, "\n");
}

function normalizeInvocation(invocation) {
  return String(invocation || "").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return "nan";
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? "inf" : "-inf";
    }
    return value;
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[Array(${value.length})]`;
    }
    return value.slice(0, 8).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    if (value.kind === "builtin") {
      return `<builtin ${value.name}>`;
    }
    if (value.kind === "bound_method") {
      return `<method ${value.name}>`;
    }
    if (value.kind === "implicit_receiver") {
      return `<${value.name}>`;
    }
    if (value.kind === "user_function") {
      return `<function ${value.fn ? value.fn.name : "anonymous"}>`;
    }
    if (depth >= 2) {
      return "[Object]";
    }
    const output = {};
    Object.keys(value)
      .slice(0, 8)
      .forEach((key) => {
        output[key] = sanitizeValue(value[key], depth + 1);
      });
    return output;
  }

  return String(value);
}

function formatInlineValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatInlineValue(item)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return "{...}";
  }
  return String(value);
}

function formatValue(value) {
  if (value === undefined) {
    return "unset";
  }
  if (value === null) {
    return "None";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(message) {
  elements.errorBox.textContent = message;
  elements.errorBox.classList.remove("hidden");
}

function hideError() {
  elements.errorBox.textContent = "";
  elements.errorBox.classList.add("hidden");
}

init();
