(function installFractionsMadarRuntime(global) {
  "use strict";

  const LEVELS = Object.freeze({
    easy: Object.freeze({ label: "المستوى البسيط", certificateLabel: "بسيط", seconds: 25, multiplier: 1 }),
    medium: Object.freeze({ label: "المستوى المتوسط", certificateLabel: "متوسط", seconds: 22, multiplier: 1.35 }),
    hard: Object.freeze({ label: "المستوى المتقدم", certificateLabel: "متقدم", seconds: 28, multiplier: 1.75 }),
  });

  let port = null;
  let nonce = "";
  let bridgeConfig = null;
  let sequence = 0;
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function sendHandshake() {
    if (window.parent !== window) window.parent.postMessage({ type: "madar:ready", runtime: "madar-game-bridge-v1" }, "*");
  }

  function bridgeRequest(event, payload = {}) {
    return readyPromise.then(() => new Promise((resolve, reject) => {
      const requestId = `fractions-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("لم تستجب منصة مدار للعبة في الوقت المحدد."));
      }, 20000);
      pending.set(requestId, { resolve, reject, timeout });
      port.postMessage({ type: "madar:request", nonce, requestId, event, payload });
    }));
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "madar:connect" || event.data?.runtime !== "madar-game-bridge-v1" || !event.ports?.[0] || port) return;
    port = event.ports[0];
    nonce = String(event.data.nonce || "");
    bridgeConfig = event.data.config || {};
    port.onmessage = (message) => {
      const data = message.data || {};
      if (data.type !== "madar:response" || data.nonce !== nonce) return;
      const item = pending.get(data.requestId);
      if (!item) return;
      clearTimeout(item.timeout);
      pending.delete(data.requestId);
      if (data.ok === false) item.reject(new Error(data.error || "تعذّر تنفيذ طلب اللعبة."));
      else item.resolve(data.payload || {});
    };
    port.start?.();
    resolveReady(bridgeConfig);
  });

  const handshakeTimer = setInterval(() => {
    if (port) clearInterval(handshakeTimer);
    else sendHandshake();
  }, 500);
  setTimeout(() => {
    if (!port) {
      clearInterval(handshakeTimer);
      rejectReady(new Error("تعذّر ربط اللعبة بمنصة مدار."));
    }
  }, 20000);
  sendHandshake();

  const MadarGameBridge = Object.freeze({
    runtime: "madar-game-bridge-v1",
    ready: () => readyPromise,
    startRound: (difficulty, questionCount) => bridgeRequest("round_started", { difficulty, questionCount }),
    submitAnswer: (payload) => bridgeRequest("question_answered", payload || {}),
    finishRound: (payload) => bridgeRequest("round_finished", payload || {}),
    requestCertificate: () => bridgeRequest("certificate_requested", {}),
  });
  global.MadarGameBridge = MadarGameBridge;

  function validGameKey(value) {
    const key = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(key)) throw new Error("معرّف اللعبة غير صالح.");
    return key;
  }

  function formatDurationArabic(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (!minutes) return `${rest} ثانية`;
    return rest ? `${minutes} دقيقة و ${rest} ثانية` : `${minutes} دقيقة`;
  }

  class InteractiveGameRuntime {
    constructor(options = {}) {
      this.gameKey = validGameKey(options.gameKey);
      this.teacherPreview = Boolean(options.teacherPreview);
    }

    async loadConfig() {
      const config = await MadarGameBridge.ready();
      const game = config.game || {};
      const player = config.player || {};
      return {
        gameConfig: {
          ...game,
          ...player,
          configured: Number(game.unitNumber) > 0 && Number(game.lessonNumber) > 0 && String(game.lessonName || "").trim() !== "",
          isActive: true,
          certificatePortfolioEnabled: game.certificateEnabled !== false,
        },
        player,
        preview: Boolean(config.preview),
      };
    }

    async startSession(difficulty, questionCount) {
      const data = await MadarGameBridge.startRound(difficulty, questionCount);
      return {
        ...data,
        sessionId: String(data.attemptId || (data.runStarted ? "active" : "preview")),
        questions: Array.isArray(data.questions) ? data.questions : [],
      };
    }

    submitAnswer(sessionId, questionIndex, answer) {
      return MadarGameBridge.submitAnswer({ questionKey: `q${questionIndex + 1}`, answer });
    }

    reportAnswer(payload) {
      return MadarGameBridge.submitAnswer(payload);
    }

    saveAttempt(sessionId, csrfToken, summary = {}) {
      return MadarGameBridge.finishRound(summary);
    }

    saveCertificate() {
      return MadarGameBridge.requestCertificate();
    }
  }

  global.MadarInteractiveGame = Object.freeze({
    Runtime: InteractiveGameRuntime,
    bridge: MadarGameBridge,
    levels: LEVELS,
    formatDurationArabic,
    certificate: Object.freeze({
      mount: () => null,
      render: () => null,
      open: () => MadarGameBridge.requestCertificate(),
      close: () => null,
    }),
    siteHomePath: "#",
    gamesHomePath: () => "#",
  });
})(window);
