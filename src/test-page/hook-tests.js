import * as hooks from "../framework/hooks.js";
import { createElement, diff } from "../framework/vdom.js";
import { beginComponent, endComponent, mount } from "../framework/component.js";

const {
  useState,
  useEffect,
  cleanupEffects,
  scheduleRender,
  __getHookStore,
  __getEffectStore,
} = hooks;

const INITIAL_LIKE_POST = {
  id: "p001",
  author: "codex",
  text: "10초 뒤 사라지는 게시물",
  likeCount: 2,
  ttl: 10,
  liked: false,
};

const SCENARIO_META = {
  like: {
    id: "like",
    title: "좋아요 클릭",
    subtitle: "버튼을 누르면 좋아요 수와 TTL이 함께 바뀝니다.",
    status: "ready",
    prefix: "LikeScenario",
    emptyMessage: "왼쪽 카드에서 좋아요 버튼을 눌러 보세요. 오른쪽 로그가 순서대로 펼쳐집니다.",
  },
  timer: {
    id: "timer",
    title: "타이머 재설정",
    subtitle: "타이머를 바꾸면 이전 effect cleanup과 새 effect 등록이 이어서 보입니다.",
    status: "ready",
    prefix: "TimerScenario",
    emptyMessage: "왼쪽 타이머 카드에서 재설정 버튼을 눌러 보세요.",
  },
  memo: {
    id: "memo",
    title: "정렬 캐시",
    subtitle: "useMemo가 구현되면 같은 계산을 재사용하는 흐름을 붙일 자리입니다.",
    status: typeof hooks.useMemo === "function" ? "ready" : "pending",
    prefix: "MemoScenario",
    emptyMessage: "왼쪽 준비중 보기 버튼을 눌러 현재 상태를 확인할 수 있습니다.",
  },
};

const likeRuntime = { renderCount: 0 };
const timerRuntime = {
  renderCount: 0,
  currentTimerId: "timer-10",
  lastCleanupId: "없음",
};

let mounted = false;
let activeScenarioId = "like";
let bridge = {
  isBusy: () => false,
  playSequence: async () => {},
};

export function createSimulationRuntime({ mountTarget, controller }) {
  bridge = controller;

  if (!mounted) {
    mount(SimulationRoot, mountTarget);
    mounted = true;
  }

  return {
    getScenarios,
    getActiveScenario,
    selectScenario,
    resetScenario,
  };
}

function getScenarios() {
  return Object.values(SCENARIO_META);
}

function getActiveScenario() {
  return SCENARIO_META[activeScenarioId];
}

function selectScenario(nextId) {
  if (!SCENARIO_META[nextId] || nextId === activeScenarioId) return;

  cleanupScenario(activeScenarioId);
  resetRuntime(activeScenarioId);
  activeScenarioId = nextId;
  resetRuntime(activeScenarioId);
  scheduleRender();
}

function resetScenario() {
  cleanupScenario(activeScenarioId);
  resetRuntime(activeScenarioId);
  scheduleRender();
}

function cleanupScenario(id) {
  const meta = SCENARIO_META[id];
  if (!meta) return;
  cleanupEffects(meta.prefix);
}

function resetRuntime(id) {
  if (id === "like") {
    likeRuntime.renderCount = 0;
  }

  if (id === "timer") {
    timerRuntime.renderCount = 0;
    timerRuntime.currentTimerId = "timer-10";
    timerRuntime.lastCleanupId = "없음";
  }
}

function SimulationRoot() {
  let scene = null;

  if (activeScenarioId === "like") {
    scene = LikeScenario();
  } else if (activeScenarioId === "timer") {
    scene = TimerScenario();
  } else {
    scene = MemoScenario();
  }

  return createElement(
    "div",
    {
      class: `sim-stage-screen sim-stage-screen--${activeScenarioId}`,
      "data-key": `scenario-${activeScenarioId}`,
    },
    scene
  );
}

function LikeScenario() {
  beginComponent("LikeScenario");
  likeRuntime.renderCount += 1;

  const [post, setPost] = useState(clone(INITIAL_LIKE_POST));

  const handleLike = () => {
    if (bridge.isBusy() || post.liked) return;

    const before = clone(post);
    const beforeRenderCount = likeRuntime.renderCount;
    const beforeTree = buildLikeStaticTree(before);

    setPost((prev) => ({
      ...prev,
      liked: true,
      likeCount: prev.likeCount + 1,
      ttl: prev.ttl + 5,
    }));

    queueMicrotask(async () => {
      if (activeScenarioId !== "like") return;

      const after = readStateValue("LikeScenario");
      const afterRenderCount = likeRuntime.renderCount;
      const hookKey = findHookKey("LikeScenario", ":state:0");
      const afterTree = buildLikeStaticTree(after);
      const patches = diff(beforeTree, afterTree, [], { v: 0 }, "root").filter(
        (patch) => patch.type !== "HANDLERS"
      );

      await bridge.playSequence(
        "like",
        buildLikeSequence({
          hookKey,
          before,
          after,
          patches,
          beforeRenderCount,
          afterRenderCount,
        })
      );
    });
  };

  endComponent();
  return buildLikeInteractiveTree(post, handleLike);
}

function TimerScenario() {
  beginComponent("TimerScenario");
  timerRuntime.renderCount += 1;

  const [ttl, setTtl] = useState(10);

  useEffect(() => {
    const timerId = `timer-${ttl}`;
    timerRuntime.currentTimerId = timerId;

    if (activeScenarioId === "timer") {
      scheduleRender();
    }

    return () => {
      timerRuntime.lastCleanupId = timerId;

      if (activeScenarioId === "timer") {
        scheduleRender();
      }
    };
  }, [ttl]);

  const handleResetTimer = () => {
    if (bridge.isBusy() || ttl === 15) return;

    const before = {
      ttl,
      timerId: timerRuntime.currentTimerId,
      cleanupId: timerRuntime.lastCleanupId,
    };
    const beforeRenderCount = timerRuntime.renderCount;
    const beforeTree = buildTimerStaticTree(before);

    setTtl(15);

    queueMicrotask(async () => {
      await waitFrame();
      if (activeScenarioId !== "timer") return;

      const hookKey = findHookKey("TimerScenario", ":state:0");
      const effectKey = findEffectKey("TimerScenario");
      const after = {
        ttl: readStateValue("TimerScenario"),
        timerId: timerRuntime.currentTimerId,
        cleanupId: timerRuntime.lastCleanupId,
      };
      const afterRenderCount = timerRuntime.renderCount;
      const afterTree = buildTimerStaticTree(after);
      const patches = diff(beforeTree, afterTree, [], { v: 0 }, "root").filter(
        (patch) => patch.type !== "HANDLERS"
      );

      await bridge.playSequence(
        "timer",
        buildTimerSequence({
          hookKey,
          effectKey,
          before,
          after,
          patches,
          beforeRenderCount,
          afterRenderCount,
        })
      );
    });
  };

  endComponent();
  return buildTimerInteractiveTree(
    {
      ttl,
      timerId: timerRuntime.currentTimerId,
      cleanupId: timerRuntime.lastCleanupId,
    },
    handleResetTimer
  );
}

function MemoScenario() {
  const hasUseMemo = typeof hooks.useMemo === "function";

  const handleInfo = async () => {
    if (bridge.isBusy()) return;

    if (!hasUseMemo) {
      await bridge.playSequence("memo", [
        {
          label: "CHECK",
          title: "useMemo 구현 여부를 확인합니다",
          details: ["현재 hooks.js export를 읽어 준비 상태를 점검했습니다."],
          highlightTargets: [".sim-memo-card"],
        },
        {
          label: "RESULT",
          title: "현재 엔진에는 useMemo가 없습니다",
          details: ["구현이 들어오면 같은 deps 재사용과 재계산 흐름을 붙일 예정입니다."],
          highlightTargets: [".sim-memo-card"],
        },
      ]);
      return;
    }

    await bridge.playSequence("memo", [
      {
        label: "READY",
        title: "useMemo가 구현되어 시뮬레이션을 확장할 수 있습니다",
        details: ["같은 계산 재사용과 deps 변경 시 재계산 흐름을 연결하면 됩니다."],
        highlightTargets: [".sim-memo-card"],
      },
    ]);
  };

  return createElement(
    "section",
    { class: "sim-memo-card" },
    createElement(
      "div",
      { class: "sim-memo-card__badge" },
      hasUseMemo ? "확장 가능" : "준비중"
    ),
    createElement("h3", { class: "sim-memo-card__title" }, "정렬 캐시 시뮬레이터"),
    createElement(
      "p",
      { class: "sim-memo-card__copy" },
      hasUseMemo
        ? "같은 정렬 계산을 다시 쓰는 흐름을 이 카드에서 이어 붙일 수 있습니다."
        : "현재 엔진에는 useMemo가 없어 안내 흐름만 먼저 보여줍니다."
    ),
    createElement(
      "button",
      { class: "btn btn-primary sim-action-btn", onClick: handleInfo },
      hasUseMemo ? "준비 상태 보기" : "왜 준비중인지 보기"
    )
  );
}

function buildLikeInteractiveTree(post, onLike) {
  return createElement(
    "div",
    { class: "sim-scene sim-scene--feed" },
    createElement(
      "div",
      { class: "feed-tabs sim-feed-tabs" },
      createElement("button", { class: "feed-tabs__button feed-tabs__button--active", type: "button" }, "실시간 피드"),
      createElement("button", { class: "feed-tabs__button", type: "button" }, "내가 올린 글")
    ),
    createElement(
      "article",
      { class: "post-card post-card--yellow sim-post-card", "data-key": post.id },
      createElement(
        "div",
        { class: "post-card__media sim-post-card__media" },
        createElement("div", { class: "post-card__no-image" }),
        createElement(
          "div",
          { class: "post-card__overlay" },
          createElement("p", { class: "post-card__text" }, post.text)
        )
      ),
      createElement(
        "div",
        { class: "post-card__footer" },
        createElement("span", { class: "post-card__author" }, `@${post.author}`),
        createElement(
          "div",
          { class: "post-card__ttl-row" },
          createElement(
            "div",
            { class: "post-card__ttl-bar" },
            createElement("div", {
              class: "post-card__ttl-fill post-card__ttl-fill--yellow",
              style: `width: ${Math.min(100, (post.ttl / 15) * 100)}%`,
            })
          ),
          createElement(
            "span",
            { class: "post-card__ttl-text post-card__ttl-text--yellow sim-ttl-value" },
            `${post.ttl}s`
          )
        ),
        createElement(
          "button",
          {
            class: `post-card__like-btn sim-like-button${post.liked ? " post-card__like-btn--liked" : ""}`,
            onClick: onLike,
            title: "좋아요",
          },
          createElement("span", { class: "post-card__like-icon" }, "♥"),
          createElement("span", { class: "post-card__like-count sim-like-count" }, String(post.likeCount))
        )
      )
    ),
    createElement(
      "p",
      { class: "sim-scene__hint" },
      post.liked ? "초기화 버튼으로 다시 시작할 수 있습니다." : "좋아요를 눌러 오른쪽 로그를 재생해 보세요."
    )
  );
}

function buildLikeStaticTree(post) {
  return createElement(
    "article",
    { class: "post-card post-card--yellow" },
    createElement(
      "div",
      { class: "post-card__media" },
      createElement("div", { class: "post-card__no-image" }),
      createElement(
        "div",
        { class: "post-card__overlay" },
        createElement("p", { class: "post-card__text" }, post.text)
      )
    ),
    createElement(
      "div",
      { class: "post-card__footer" },
      createElement("span", { class: "post-card__author" }, `@${post.author}`),
      createElement(
        "div",
        { class: "post-card__ttl-row" },
        createElement(
          "div",
          { class: "post-card__ttl-bar" },
          createElement("div", {
            class: "post-card__ttl-fill post-card__ttl-fill--yellow",
            style: `width: ${Math.min(100, (post.ttl / 15) * 100)}%`,
          })
        ),
        createElement("span", { class: "post-card__ttl-text" }, `${post.ttl}s`)
      ),
      createElement(
        "button",
        { class: "post-card__like-btn" },
        createElement("span", { class: "post-card__like-icon" }, "♥"),
        createElement("span", { class: "post-card__like-count" }, String(post.likeCount))
      )
    )
  );
}

function buildTimerInteractiveTree(model, onResetTimer) {
  const fillClass = model.ttl > 12 ? "post-card__ttl-fill--green" : "post-card__ttl-fill--yellow";

  return createElement(
    "div",
    { class: "sim-scene" },
    createElement(
      "section",
      { class: "sim-timer-card" },
      createElement(
        "div",
        { class: "sim-timer-card__top" },
        createElement(
          "div",
          {},
          createElement("div", { class: "sim-badge" }, "useEffect 시나리오"),
          createElement("h3", { class: "sim-timer-card__title" }, "게시물 TTL 타이머")
        ),
        createElement("div", { class: "sim-timer-card__value sim-timer-ttl" }, `${model.ttl}s`)
      ),
      createElement(
        "div",
        { class: "post-card__ttl-bar sim-timer-card__bar" },
        createElement("div", {
          class: `post-card__ttl-fill ${fillClass}`,
          style: `width: ${Math.min(100, (model.ttl / 15) * 100)}%`,
        })
      ),
      createElement(
        "div",
        { class: "sim-timer-card__row" },
        createElement("span", { class: "sim-timer-card__label" }, "현재 timer"),
        createElement("strong", { class: "sim-timer-id" }, model.timerId)
      ),
      createElement(
        "div",
        { class: "sim-timer-card__row" },
        createElement("span", { class: "sim-timer-card__label" }, "마지막 cleanup"),
        createElement("strong", { class: "sim-timer-cleanup" }, model.cleanupId)
      ),
      createElement(
        "button",
        { class: "btn btn-primary sim-action-btn sim-timer-button", onClick: onResetTimer },
        model.ttl === 15 ? "이미 15초 상태" : "15초로 재설정"
      )
    ),
    createElement(
      "p",
      { class: "sim-scene__hint" },
      "버튼을 누르면 이전 timer cleanup과 새 effect 등록 흐름이 오른쪽에 이어서 표시됩니다."
    )
  );
}

function buildTimerStaticTree(model) {
  return createElement(
    "section",
    { class: "sim-timer-card" },
    createElement(
      "div",
      { class: "sim-timer-card__top" },
      createElement("h3", { class: "sim-timer-card__title" }, "게시물 TTL 타이머"),
      createElement("div", { class: "sim-timer-card__value" }, `${model.ttl}s`)
    ),
    createElement(
      "div",
      { class: "sim-timer-card__row" },
      createElement("span", { class: "sim-timer-card__label" }, "현재 timer"),
      createElement("strong", {}, model.timerId)
    ),
    createElement(
      "div",
      { class: "sim-timer-card__row" },
      createElement("span", { class: "sim-timer-card__label" }, "마지막 cleanup"),
      createElement("strong", {}, model.cleanupId)
    )
  );
}

function buildLikeSequence({ hookKey, before, after, patches, beforeRenderCount, afterRenderCount }) {
  return [
    {
      label: "ACTION",
      title: `사용자가 게시물 #${before.id}에 좋아요를 눌렀습니다`,
      details: [],
      highlightTargets: [".sim-like-button"],
    },
    {
      label: "HOOK",
      title: "useState 호출",
      details: [
        "hookIndex : 0",
        `저장 위치 : ${shortSlot(hookKey, "state:0")}`,
        `이전 state : ${formatObject({ like_count: before.likeCount, ttl: before.ttl })}`,
        `새 state : ${formatObject({ like_count: after.likeCount, ttl: after.ttl })}`,
      ],
      highlightTargets: [".sim-post-card"],
    },
    {
      label: "STATE",
      title: "상태 변경 감지 후 다시 렌더를 예약합니다",
      details: [
        `변경된 값 : like_count (${before.likeCount} -> ${after.likeCount})`,
        `변경된 값 : ttl (${before.ttl} -> ${after.ttl})`,
      ],
      highlightTargets: [".sim-like-count", ".sim-ttl-value"],
    },
    {
      label: "UPDATE",
      title: "컴포넌트가 다시 실행됩니다",
      details: [
        "컴포넌트 : <LikeScenario />",
        `추가 render 수 : ${Math.max(0, afterRenderCount - beforeRenderCount)}회`,
      ],
      highlightTargets: [".sim-post-card"],
    },
    {
      label: "DIFF",
      title: "이전 화면과 새 화면을 비교합니다",
      details: [
        `좋아요 수 : ${before.likeCount} -> ${after.likeCount}`,
        `TTL : ${before.ttl}s -> ${after.ttl}s`,
      ],
      highlightTargets: [".sim-like-count", ".sim-ttl-value"],
    },
    {
      label: "PATCH",
      title: "실제 DOM에 바뀐 부분만 반영합니다",
      details: [
        `의미 있는 패치 수 : ${countMeaningfulPatches(patches)}개`,
        "반영 대상 : 좋아요 수, TTL 텍스트",
      ],
      highlightTargets: [".sim-like-count", ".sim-ttl-value"],
    },
    {
      label: "RENDER",
      title: "화면이 새 상태로 바뀌었습니다",
      details: [`최종 결과 : 좋아요 ${after.likeCount}, TTL ${after.ttl}s`],
      highlightTargets: [".sim-post-card"],
    },
  ];
}

function buildTimerSequence({ hookKey, effectKey, before, after, patches, beforeRenderCount, afterRenderCount }) {
  return [
    {
      label: "ACTION",
      title: `타이머를 ${before.ttl}s에서 ${after.ttl}s로 바꿉니다`,
      details: [],
      highlightTargets: [".sim-timer-button"],
    },
    {
      label: "HOOK",
      title: "useState 호출",
      details: [
        "hookIndex : 0",
        `저장 위치 : ${shortSlot(hookKey, "state:0")}`,
        `이전 state : ${before.ttl}`,
        `새 state : ${after.ttl}`,
      ],
      highlightTargets: [".sim-timer-ttl"],
    },
    {
      label: "STATE",
      title: "TTL 변경으로 다시 렌더를 예약합니다",
      details: [
        `변경된 값 : ttl (${before.ttl} -> ${after.ttl})`,
        `추가 render 수 : ${Math.max(0, afterRenderCount - beforeRenderCount)}회`,
      ],
      highlightTargets: [".sim-timer-ttl"],
    },
    {
      label: "EFFECT",
      title: "useEffect가 deps 변경을 감지합니다",
      details: [
        `저장 위치 : ${shortSlot(effectKey, "effect:1")}`,
        `deps : [${before.ttl}] -> [${after.ttl}]`,
      ],
      highlightTargets: [".sim-timer-id"],
    },
    {
      label: "CLEANUP",
      title: "이전 timer를 정리합니다",
      details: [`정리된 timer : ${after.cleanupId}`],
      highlightTargets: [".sim-timer-cleanup"],
    },
    {
      label: "EFFECT",
      title: "새 effect를 다시 등록합니다",
      details: [`새 timer : ${after.timerId}`],
      highlightTargets: [".sim-timer-id"],
    },
    {
      label: "PATCH",
      title: "바뀐 DOM만 다시 반영합니다",
      details: [
        `의미 있는 패치 수 : ${countMeaningfulPatches(patches)}개`,
        "반영 대상 : TTL, timer 표시",
      ],
      highlightTargets: [".sim-timer-ttl", ".sim-timer-id"],
    },
    {
      label: "RENDER",
      title: "타이머 화면이 새 상태가 됩니다",
      details: [`최종 결과 : ${after.ttl}s / ${after.timerId}`],
      highlightTargets: [".sim-timer-card"],
    },
  ];
}

function readStateValue(prefix) {
  const key = findHookKey(prefix, ":state:0");
  return key ? clone(__getHookStore().get(key)) : null;
}

function findHookKey(prefix, suffix) {
  return Array.from(__getHookStore().keys()).find(
    (key) => key.startsWith(prefix) && key.endsWith(suffix)
  );
}

function findEffectKey(prefix) {
  return Array.from(__getEffectStore().keys()).find(
    (key) => key.startsWith(prefix) && key.endsWith(":effect:1")
  );
}

function shortSlot(fullKey, fallback) {
  if (!fullKey) return fallback;
  return fullKey.split(":").slice(-2).join(":");
}

function countMeaningfulPatches(patches) {
  return patches.filter((patch) =>
    ["TEXT", "PROPS", "REPLACE", "INSERT", "REMOVE"].includes(patch.type)
  ).length;
}

function formatObject(obj) {
  return `{ ${Object.entries(obj).map(([key, value]) => `${key}: ${value}`).join(", ")} }`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
