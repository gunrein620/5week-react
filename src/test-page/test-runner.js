import { createSimulationRuntime } from "./hook-tests.js";

const state = {
  runtime: null,
  currentSteps: [],
  activeStepIndex: -1,
  playbackToken: 0,
};

let dom = null;

function bindDom() {
  dom = {
    tabs: document.getElementById("scenario-tabs"),
    stageTitle: document.getElementById("scenario-title"),
    stageSubtitle: document.getElementById("scenario-subtitle"),
    stageRoot: document.getElementById("scenario-root"),
    consoleBody: document.getElementById("console-body"),
    resetButton: document.getElementById("scenario-reset"),
    headerMeta: document.getElementById("header-meta"),
  };
}

function initialize() {
  bindDom();

  state.runtime = createSimulationRuntime({
    mountTarget: dom.stageRoot,
    controller: {
      isBusy: () => state.activeStepIndex !== -1,
      playSequence,
    },
  });

  dom.resetButton.addEventListener("click", () => {
    cancelPlayback();
    state.runtime.resetScenario();
    renderStageInfo();
    renderConsole();
  });

  renderTabs();
  renderStageInfo();
  renderConsole();
  renderMeta();
}

async function playSequence(_scenarioId, steps) {
  const token = ++state.playbackToken;
  state.currentSteps = [];
  state.activeStepIndex = -1;
  renderConsole();
  renderMeta();

  for (let index = 0; index < steps.length; index += 1) {
    if (token !== state.playbackToken) return;

    state.currentSteps = steps.slice(0, index + 1);
    state.activeStepIndex = index;
    renderConsole();
    renderMeta();
    pulseTargets(steps[index].highlightTargets || []);
    await wait(520);
  }

  if (token !== state.playbackToken) return;

  state.activeStepIndex = -1;
  renderConsole();
  renderMeta();
}

function cancelPlayback() {
  state.playbackToken += 1;
  state.currentSteps = [];
  state.activeStepIndex = -1;
  renderConsole();
  renderMeta();
}

function renderTabs() {
  const scenarios = state.runtime.getScenarios();
  const active = state.runtime.getActiveScenario();

  dom.tabs.innerHTML = scenarios
    .map((scenario) => {
      const activeClass = scenario.id === active.id ? "sim-tab--active" : "";
      const badge =
        scenario.status === "pending"
          ? `<span class="sim-tab__badge">준비중</span>`
          : "";

      return `
        <button class="sim-tab ${activeClass}" type="button" data-scenario-id="${scenario.id}">
          <span class="sim-tab__title">${escapeHtml(scenario.title)}</span>
          ${badge}
        </button>
      `;
    })
    .join("");

  dom.tabs.querySelectorAll("[data-scenario-id]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelPlayback();
      state.runtime.selectScenario(button.getAttribute("data-scenario-id"));
      renderTabs();
      renderStageInfo();
      renderConsole();
    });
  });
}

function renderStageInfo() {
  const active = state.runtime.getActiveScenario();
  dom.stageTitle.textContent = active.title;
  dom.stageSubtitle.textContent = active.subtitle;
}

function renderConsole() {
  const active = state.runtime.getActiveScenario();

  if (state.currentSteps.length === 0) {
    dom.consoleBody.innerHTML = `
      <div class="console-empty">
        <div class="console-empty__title">로그 대기 중</div>
        <div class="console-empty__copy">${escapeHtml(active.emptyMessage)}</div>
      </div>
    `;
    return;
  }

  dom.consoleBody.innerHTML = state.currentSteps
    .map((step, index) => {
      const activeClass = index === state.activeStepIndex ? "console-entry--active" : "";

      return `
        <article class="console-entry ${activeClass}">
          <div class="console-entry__top">
            <span class="console-entry__label">[${escapeHtml(step.label)}]</span>
            <span class="console-entry__title">${escapeHtml(step.title)}</span>
          </div>
          <div class="console-entry__details">
            ${(step.details || [])
              .map((detail, detailIndex, all) => {
                const prefix =
                  all.length === 1
                    ? "└─"
                    : detailIndex === all.length - 1
                      ? "└─"
                      : "├─";

                return `
                  <div class="console-entry__detail">
                    <span class="console-entry__branch">${prefix}</span>
                    <span>${escapeHtml(detail)}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    dom.consoleBody.scrollTop = dom.consoleBody.scrollHeight;
  });
}

function renderMeta() {
  if (state.activeStepIndex !== -1) {
    const active = state.runtime?.getActiveScenario();
    dom.headerMeta.textContent = `${active?.title || "시나리오"} 재생 중`;
    return;
  }

  dom.headerMeta.textContent = "왼쪽에서 눌러 보세요";
}

function pulseTargets(selectors) {
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.classList.remove("sim-target--pulse");
      void element.offsetWidth;
      element.classList.add("sim-target--pulse");
      setTimeout(() => {
        element.classList.remove("sim-target--pulse");
      }, 700);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

initialize();
