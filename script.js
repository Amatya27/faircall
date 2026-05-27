const STORAGE_KEYS = {
  theme: "faircall-theme",
  mode: "faircall-mode",
};

const SLICE_COLORS = [
  "#ef7d57",
  "#f2b84b",
  "#44b88b",
  "#2d9fc3",
  "#4b7bec",
  "#1f9d8a",
  "#f18d64",
  "#88b04b",
  "#577590",
  "#d77a61",
];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const COIN_RESULT_REVEAL_DELAY_MS = prefersReducedMotion.matches ? 800 : 1800;

const state = {
  activeMode: "coin",
  coinFace: "Heads",
  coinRotation: 0,
  coinAnimating: false,
  coinRevealTimeoutId: null,
  wheelCount: 4,
  wheelLabels: Array.from({ length: 10 }, () => ""),
  wheelRotation: 0,
  wheelSpinning: false,
  wheelFrameId: null,
  wheelCanvasSize: 0,
  modalContext: "coin",
  lastFocusedElement: null,
};

const root = document.documentElement;
const body = document.body;
const themeToggle = document.querySelector("#themeToggle");
const modeTabs = [...document.querySelectorAll(".mode-tab")];
const panels = {
  coin: document.querySelector("#panel-coin"),
  wheel: document.querySelector("#panel-wheel"),
};
const summaryTitle = document.querySelector("#summaryTitle");
const summaryText = document.querySelector("#summaryText");

const coinStage = document.querySelector("#coinStage");
const coinButton = document.querySelector("#coinButton");
const coin = document.querySelector("#coin");
const coinStatus = document.querySelector("#coinStatus");
const coinCurrentFace = document.querySelector("#coinCurrentFace");
const flipButton = document.querySelector("#flipButton");
const resetCoinButton = document.querySelector("#resetCoinButton");

const optionCount = document.querySelector("#optionCount");
const optionCountInput = document.querySelector("#optionCountInput");
const labelGrid = document.querySelector("#labelGrid");
const clearLabelsButton = document.querySelector("#clearLabelsButton");
const spinButton = document.querySelector("#spinButton");
const resetWheelButton = document.querySelector("#resetWheelButton");
const wheelStatus = document.querySelector("#wheelStatus");
const wheelStage = document.querySelector("#wheelStage");
const wheelButton = document.querySelector("#wheelButton");
const wheelCanvas = document.querySelector("#wheelCanvas");
const wheelContext = wheelCanvas.getContext("2d");

const resultModal = document.querySelector("#resultModal");
const resultKicker = document.querySelector("#resultKicker");
const resultTitle = document.querySelector("#resultTitle");
const resultDescription = document.querySelector("#resultDescription");
const closeModalButton = document.querySelector("#closeModalButton");
const retryActionButton = document.querySelector("#retryActionButton");
const resetActionButton = document.querySelector("#resetActionButton");
const confettiLayer = document.querySelector("#confettiLayer");

function getStoredTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isWheelVisible() {
  return wheelStage.getClientRects().length > 0;
}

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));

  if (isWheelVisible()) {
    renderWheel();
  }
}

function toggleTheme() {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
}

function setMode(mode) {
  state.activeMode = mode;
  localStorage.setItem(STORAGE_KEYS.mode, mode);

  modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  Object.entries(panels).forEach(([key, panel]) => {
    const isActive = key === mode;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });

  if (mode === "wheel") {
    requestAnimationFrame(() => {
      if (isWheelVisible()) {
        resizeWheelCanvas();
        renderWheel();
      }
    });
  }
}

function resetSummary() {
  summaryTitle.textContent = "Ready when you are";
  summaryText.textContent = "Choose a mode, then let the toss or wheel break the tie.";
}

function updateSummary(title, text) {
  summaryTitle.textContent = title;
  summaryText.textContent = text;
}

function getRandomInt(max) {
  if (max <= 0) {
    return 0;
  }

  if (window.crypto?.getRandomValues) {
    const range = 0x100000000;
    const cutoff = range - (range % max);
    const values = new Uint32Array(1);
    let randomValue = 0;

    do {
      window.crypto.getRandomValues(values);
      randomValue = values[0];
    } while (randomValue >= cutoff);

    return randomValue % max;
  }

  return Math.floor(Math.random() * max);
}

function clampWheelCount(value) {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    return state.wheelCount;
  }

  return Math.min(10, Math.max(2, parsedValue));
}

function getRandomFloat() {
  return getRandomInt(10000) / 10000;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeRadians(radians) {
  const turn = Math.PI * 2;
  return ((radians % turn) + turn) % turn;
}

function getSliceColor(index) {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

function getSliceLabel(index) {
  const customLabel = state.wheelLabels[index].trim();
  return customLabel || String(index + 1);
}

function getDisplayedSliceLabel(index) {
  const fullLabel = getSliceLabel(index);
  const limit = state.wheelCount >= 7 ? 10 : 16;
  return fullLabel.length > limit ? `${fullLabel.slice(0, limit - 3)}...` : fullLabel;
}

function updateWheelButtonLabel() {
  const labels = Array.from({ length: state.wheelCount }, (_, index) => getSliceLabel(index));
  wheelButton.setAttribute(
    "aria-label",
    `Spin the wheel with ${state.wheelCount} choices: ${labels.join(", ")}.`
  );
}

function buildLabelInputs() {
  labelGrid.replaceChildren();

  for (let index = 0; index < state.wheelCount; index += 1) {
    const field = document.createElement("label");
    field.className = "label-field";
    field.setAttribute("for", `choice-${index}`);

    const header = document.createElement("span");
    header.className = "label-field-header";

    const chip = document.createElement("span");
    chip.className = "color-chip";
    chip.style.background = getSliceColor(index);

    const labelText = document.createElement("span");
    labelText.textContent = `Choice ${index + 1}`;

    header.append(chip, labelText);

    const input = document.createElement("input");
    input.id = `choice-${index}`;
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = `Leave blank to use ${index + 1}`;
    input.value = state.wheelLabels[index];
    input.addEventListener("input", (event) => {
      state.wheelLabels[index] = event.currentTarget.value;
      wheelStatus.textContent = "The wheel preview is updating in real time.";
      updateWheelButtonLabel();
      renderWheel();
    });

    field.append(header, input);
    labelGrid.append(field);
  }
}

function setWheelCount(value, { updateStatus = true } = {}) {
  state.wheelCount = clampWheelCount(value);
  optionCount.value = String(state.wheelCount);
  optionCountInput.value = String(state.wheelCount);

  if (updateStatus) {
    wheelStatus.textContent = `Wheel ready with ${state.wheelCount} equal choices.`;
  }

  buildLabelInputs();
  updateWheelButtonLabel();
  renderWheel();
}

function syncWheelControls(disabled) {
  optionCount.disabled = disabled;
  optionCountInput.disabled = disabled;
  clearLabelsButton.disabled = disabled;
  resetWheelButton.disabled = disabled;
  spinButton.disabled = disabled;
  wheelButton.disabled = disabled;
  labelGrid.querySelectorAll("input").forEach((input) => {
    input.disabled = disabled;
  });
}

function resizeWheelCanvas() {
  if (!isWheelVisible()) {
    return;
  }

  const stageWidth = Math.round(wheelStage.getBoundingClientRect().width);
  if (!stageWidth) {
    return;
  }

  const availableSize = Math.min(stageWidth - 32, 500);
  const size = Math.max(260, availableSize);

  if (state.wheelCanvasSize === size) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  wheelCanvas.width = Math.floor(size * ratio);
  wheelCanvas.height = Math.floor(size * ratio);
  wheelCanvas.style.width = `${size}px`;
  wheelCanvas.style.height = `${size}px`;
  wheelContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.wheelCanvasSize = size;
}

function renderWheel() {
  if (!isWheelVisible()) {
    return;
  }

  resizeWheelCanvas();

  const size = state.wheelCanvasSize || 420;
  const radius = size / 2 - 14;
  const center = size / 2;
  const sliceAngle = (Math.PI * 2) / state.wheelCount;
  const styles = getComputedStyle(root);
  const ringColor = styles.getPropertyValue("--surface-strong").trim();
  const textColor = styles.getPropertyValue("--text-strong").trim();
  const mutedRing = styles.getPropertyValue("--ring-muted").trim();

  wheelCanvas.setAttribute(
    "aria-label",
    `Decision wheel preview with ${state.wheelCount} equal slices`
  );
  wheelContext.clearRect(0, 0, size, size);
  wheelContext.save();
  wheelContext.translate(center, center);
  wheelContext.rotate(state.wheelRotation);
  wheelContext.translate(-center, -center);

  for (let index = 0; index < state.wheelCount; index += 1) {
    const startAngle = -Math.PI / 2 + index * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;
    const label = getDisplayedSliceLabel(index);

    wheelContext.beginPath();
    wheelContext.moveTo(center, center);
    wheelContext.arc(center, center, radius, startAngle, endAngle);
    wheelContext.closePath();
    wheelContext.fillStyle = getSliceColor(index);
    wheelContext.fill();
    wheelContext.lineWidth = 3;
    wheelContext.strokeStyle = ringColor;
    wheelContext.stroke();

    const labelRadius = state.wheelCount === 1 ? radius * 0.55 : radius * 0.68;
    const labelX = center + Math.cos(midAngle) * labelRadius;
    const labelY = center + Math.sin(midAngle) * labelRadius;
    const fontSize = Math.max(11, 24 - state.wheelCount);
    let labelRotation = midAngle + Math.PI / 2;

    if (labelRotation > Math.PI / 2 && labelRotation < Math.PI * 1.5) {
      labelRotation += Math.PI;
    }

    wheelContext.save();
    wheelContext.translate(labelX, labelY);
    wheelContext.rotate(labelRotation);
    wheelContext.font = `700 ${fontSize}px Manrope, sans-serif`;
    wheelContext.fillStyle = textColor;
    wheelContext.textAlign = "center";
    wheelContext.textBaseline = "middle";
    wheelContext.shadowColor = "rgba(0, 0, 0, 0.14)";
    wheelContext.shadowBlur = 8;
    wheelContext.fillText(label, 0, 0, radius * 0.42);
    wheelContext.restore();
  }

  wheelContext.restore();

  wheelContext.beginPath();
  wheelContext.arc(center, center, radius, 0, Math.PI * 2);
  wheelContext.lineWidth = 10;
  wheelContext.strokeStyle = mutedRing;
  wheelContext.stroke();

  wheelContext.beginPath();
  wheelContext.arc(center, center, radius * 0.18, 0, Math.PI * 2);
  wheelContext.fillStyle = ringColor;
  wheelContext.fill();
}

function animateValue({ from, to, duration, onUpdate, onComplete }) {
  if (prefersReducedMotion.matches || duration <= 0) {
    onUpdate(to);
    onComplete?.();
    return;
  }

  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 5);
    const currentValue = from + (to - from) * eased;

    onUpdate(currentValue);

    if (progress < 1) {
      state.wheelFrameId = window.requestAnimationFrame(step);
      return;
    }

    state.wheelFrameId = null;
    onComplete?.();
  };

  state.wheelFrameId = window.requestAnimationFrame(step);
}

function showResultModal({ kicker, title, description, context }) {
  state.modalContext = context;
  state.lastFocusedElement = document.activeElement;
  resultKicker.textContent = kicker;
  resultTitle.textContent = title;
  resultDescription.textContent = description;
  retryActionButton.textContent = context === "coin" ? "Flip Again" : "Spin Again";
  resetActionButton.textContent = context === "coin" ? "Reset Coin" : "Start Fresh";
  resultModal.hidden = false;
  body.classList.add("modal-open");
  launchConfetti();
  closeModalButton.focus();
}

function closeResultModal() {
  if (resultModal.hidden) {
    return;
  }

  resultModal.hidden = true;
  body.classList.remove("modal-open");
  confettiLayer.replaceChildren();
  state.lastFocusedElement?.focus?.();
}

function launchConfetti() {
  confettiLayer.replaceChildren();

  if (prefersReducedMotion.matches) {
    return;
  }

  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--piece-size", `${6 + getRandomInt(8)}px`);
    piece.style.setProperty("--piece-color", getSliceColor(index));
    piece.style.setProperty("--x-start", `${Math.round((getRandomFloat() - 0.5) * 80)}px`);
    piece.style.setProperty("--x-end", `${Math.round((getRandomFloat() - 0.5) * 460)}px`);
    piece.style.setProperty("--rotation-end", `${120 + getRandomInt(400)}deg`);
    piece.style.setProperty("--fall-duration", `${1400 + getRandomInt(900)}ms`);
    piece.style.setProperty("--fall-delay", `${getRandomInt(220)}ms`);
    confettiLayer.append(piece);
  }
}

function resetCoin() {
  if (state.coinAnimating) {
    return;
  }

  if (state.coinRevealTimeoutId) {
    window.clearTimeout(state.coinRevealTimeoutId);
    state.coinRevealTimeoutId = null;
  }

  coin.getAnimations().forEach((animation) => animation.cancel());
  coin.style.transform = "rotateX(0deg)";
  state.coinRotation = 0;
  state.coinFace = "Heads";
  coinCurrentFace.textContent = "Heads";
  coinStatus.textContent = "The coin is ready to flip.";
  coinButton.setAttribute("aria-label", "Flip the coin. Currently showing Heads.");
  coinButton.disabled = false;
  flipButton.disabled = false;
  resetCoinButton.disabled = false;
}

function startCoinFlip() {
  if (state.coinAnimating) {
    return;
  }

  if (state.coinRevealTimeoutId) {
    window.clearTimeout(state.coinRevealTimeoutId);
    state.coinRevealTimeoutId = null;
  }

  state.coinAnimating = true;
  coinButton.disabled = true;
  flipButton.disabled = true;
  resetCoinButton.disabled = true;
  coinStage.classList.remove("is-flipping");
  void coinStage.offsetWidth;
  coinStage.classList.add("is-flipping");
  coinStatus.textContent = "The coin is in the air...";

  const result = getRandomInt(2) === 0 ? "Heads" : "Tails";
  const desiredAngle = result === "Heads" ? 0 : 180;
  const currentAngle = normalizeDegrees(state.coinRotation);
  let delta = (desiredAngle - currentAngle + 360) % 360;

  if (delta < 180) {
    delta += 360;
  }

  const turns = prefersReducedMotion.matches ? 1 : 6 + getRandomInt(4);
  const nextRotation = state.coinRotation + turns * 360 + delta;
  const duration = prefersReducedMotion.matches ? 180 : 1650;
  const animation = coin.animate(
    [
      { transform: `rotateX(${state.coinRotation}deg)` },
      { transform: `rotateX(${nextRotation}deg)` },
    ],
    {
      duration,
      easing: "cubic-bezier(0.16, 0.84, 0.22, 1)",
      fill: "forwards",
    }
  );

  animation.onfinish = () => {
    state.coinRotation = nextRotation;
    state.coinFace = result;
    coin.style.transform = `rotateX(${nextRotation}deg)`;
    coinCurrentFace.textContent = result;
    coinStatus.textContent = `${result} landed cleanly.`;
    coinButton.setAttribute("aria-label", `Flip the coin. Currently showing ${result}.`);
    coinStage.classList.remove("is-flipping");
    updateSummary(
      result,
      `Coin toss result from a fresh 50 / 50 draw. Pair your preferred choice with ${result.toLowerCase()} and go.`
    );
    state.coinRevealTimeoutId = window.setTimeout(() => {
      state.coinRevealTimeoutId = null;
      showResultModal({
        kicker: "Coin toss result",
        title: result,
        description: `${result} won the toss. Use that as your tie-breaker and move with confidence.`,
        context: "coin",
      });
      state.coinAnimating = false;
      coinButton.disabled = false;
      flipButton.disabled = false;
      resetCoinButton.disabled = false;
    }, COIN_RESULT_REVEAL_DELAY_MS);
  };
}

function resetWheel({ resetCount = true } = {}) {
  if (state.wheelSpinning) {
    return;
  }

  if (resetCount) {
    setWheelCount(4, { updateStatus: false });
  } else {
    optionCount.value = String(state.wheelCount);
    optionCountInput.value = String(state.wheelCount);
  }

  state.wheelLabels = Array.from({ length: 10 }, () => "");
  state.wheelRotation = 0;
  buildLabelInputs();
  updateWheelButtonLabel();
  renderWheel();
  wheelStatus.textContent = "The wheel updates instantly as you edit your choices.";
  syncWheelControls(false);
}

function startWheelSpin() {
  if (state.wheelSpinning) {
    return;
  }

  state.wheelSpinning = true;
  syncWheelControls(true);
  wheelStatus.textContent = "The wheel is spinning...";

  const selectedIndex = getRandomInt(state.wheelCount);
  const sliceAngle = (Math.PI * 2) / state.wheelCount;
  const targetBase = Math.PI * 2 - (selectedIndex + 0.5) * sliceAngle;
  const currentRotation = normalizeRadians(state.wheelRotation);
  const delta = normalizeRadians(targetBase - currentRotation);
  const fullSpins = prefersReducedMotion.matches ? 1 : 5 + getRandomInt(4);
  const targetRotation = state.wheelRotation + fullSpins * Math.PI * 2 + delta;
  const resultLabel = getSliceLabel(selectedIndex);
  const duration = prefersReducedMotion.matches ? 240 : 4300;

  animateValue({
    from: state.wheelRotation,
    to: targetRotation,
    duration,
    onUpdate: (currentValue) => {
      state.wheelRotation = currentValue;
      renderWheel();
    },
    onComplete: () => {
      state.wheelRotation = targetRotation;
      renderWheel();
      state.wheelSpinning = false;
      syncWheelControls(false);
      wheelStatus.textContent = `Selected: ${resultLabel}.`;
      updateSummary(
        resultLabel,
        `Chosen from ${state.wheelCount} equal slices on the wheel.`
      );
      showResultModal({
        kicker: "Wheel result",
        title: resultLabel,
        description: `The wheel landed on ${resultLabel} after a fair spin across ${state.wheelCount} equal choices.`,
        context: "wheel",
      });
    },
  });
}

function closeModalAndRepeat() {
  const currentContext = state.modalContext;
  closeResultModal();
  setMode(currentContext);

  window.setTimeout(() => {
    if (currentContext === "coin") {
      startCoinFlip();
      return;
    }

    startWheelSpin();
  }, 120);
}

function closeModalAndReset() {
  const currentContext = state.modalContext;
  closeResultModal();
  setMode(currentContext);
  resetSummary();

  if (currentContext === "coin") {
    resetCoin();
    return;
  }

  resetWheel();
}

function handleModeKeyNavigation(event) {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
    return;
  }

  const currentIndex = modeTabs.findIndex((tab) => tab.dataset.mode === state.activeMode);
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (currentIndex + direction + modeTabs.length) % modeTabs.length;
  const nextTab = modeTabs[nextIndex];
  setMode(nextTab.dataset.mode);
  nextTab.focus();
}

function init() {
  setTheme(getStoredTheme());

  const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
  if (savedMode === "coin" || savedMode === "wheel") {
    state.activeMode = savedMode;
  }

  optionCount.value = String(state.wheelCount);
  optionCountInput.value = String(state.wheelCount);
  buildLabelInputs();
  updateWheelButtonLabel();
  resetCoin();
  resizeWheelCanvas();
  if (state.activeMode === "wheel") {
    renderWheel();
  }
  setMode(state.activeMode);

  themeToggle.addEventListener("click", toggleTheme);

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", handleModeKeyNavigation);
  });

  coinButton.addEventListener("click", startCoinFlip);
  flipButton.addEventListener("click", startCoinFlip);
  resetCoinButton.addEventListener("click", () => {
    resetCoin();
    resetSummary();
  });

  optionCount.addEventListener("input", (event) => {
    setWheelCount(event.currentTarget.value);
  });

  optionCountInput.addEventListener("input", (event) => {
    const nextValue = Number.parseInt(event.currentTarget.value, 10);

    if (Number.isNaN(nextValue) || nextValue < 2 || nextValue > 10) {
      return;
    }

    setWheelCount(nextValue);
  });

  optionCountInput.addEventListener("blur", () => {
    setWheelCount(optionCountInput.value);
  });

  clearLabelsButton.addEventListener("click", () => {
    state.wheelLabels = state.wheelLabels.map(() => "");
    buildLabelInputs();
    updateWheelButtonLabel();
    renderWheel();
    wheelStatus.textContent = "Custom labels cleared. The wheel now shows default numbers.";
  });

  wheelButton.addEventListener("click", startWheelSpin);
  spinButton.addEventListener("click", startWheelSpin);
  resetWheelButton.addEventListener("click", () => {
    resetWheel();
    resetSummary();
  });

  retryActionButton.addEventListener("click", closeModalAndRepeat);
  resetActionButton.addEventListener("click", closeModalAndReset);
  closeModalButton.addEventListener("click", closeResultModal);

  resultModal.addEventListener("click", (event) => {
    if (event.target.hasAttribute("data-close-modal")) {
      closeResultModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeResultModal();
    }
  });

  window.addEventListener("resize", () => {
    if (state.activeMode === "wheel") {
      resizeWheelCanvas();
      renderWheel();
    }
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      if (state.activeMode === "wheel") {
        resizeWheelCanvas();
        renderWheel();
      }
    });
    resizeObserver.observe(wheelStage);
  }
}

init();
