(function (global) {
  "use strict";

  const MNA = (global.MNA = global.MNA || {});
  const COLLAPSE_KEY = "mna-hud-collapsed";
  const PEAK_HOLD_MS = 900;
  const TONES = ["on", "warn", "hot"];

  function setTone(el, tone) {
    if (!el) {
      return;
    }
    for (const name of TONES) {
      el.classList.remove(`mna-${name}`);
    }
    if (tone === "on" || tone === "warn" || tone === "hot") {
      el.classList.add(`mna-${tone}`);
    }
  }

  MNA.createHud = function createHud() {
    const policy = MNA.POLICY;
    let displayedLevel = 0;
    let peakLevel = 0;
    let peakHoldUntil = 0;
    let toggleHandler = null;

    const host = document.createElement("div");
    host.className = "mna-host";

    const meter = document.createElement("div");
    meter.className = "mna-meter mna-collapsed";
    meter.setAttribute("role", "button");
    meter.setAttribute("aria-expanded", "false");
    meter.setAttribute("aria-label", "送信モニター");
    meter.tabIndex = 0;

    const threshRatio = Math.min(
      policy.NOISE_THRESHOLD / policy.DISPLAY_CEILING,
      1,
    );
    const segmentsHtml = Array.from(
      { length: policy.SEGMENT_COUNT },
      () => '<span class="mna-seg"></span>',
    ).join("");

    meter.innerHTML = `
      <div class="mna-meter-head">
        <span class="mna-dots">
          <span class="mna-dot" data-kind="mic"></span>
          <span class="mna-dot" data-kind="cam"></span>
          <span class="mna-dot" data-kind="net"></span>
        </span>
        <span class="mna-meter-status">待機</span>
        <span class="mna-toggle">▾</span>
      </div>
      <div class="mna-row" data-kind="mic">
        <span class="mna-k">MIC</span>
        <div class="mna-meter-track">
          ${segmentsHtml}
          <span class="mna-thresh" style="left: ${threshRatio * 100}%"></span>
          <span class="mna-peak"></span>
        </div>
        <span class="mna-meter-value">—</span>
        <span class="mna-badge">OFF</span>
      </div>
      <div class="mna-row" data-kind="cam">
        <span class="mna-k">CAM</span>
        <div class="mna-bar"><div class="mna-bar-fill"></div></div>
        <span class="mna-meter-value">—</span>
        <span class="mna-badge">OFF</span>
      </div>
      <div class="mna-row" data-kind="net">
        <span class="mna-k">NET</span>
        <div class="mna-bar"><div class="mna-bar-fill"></div></div>
        <span class="mna-meter-value">接続待ち</span>
        <span class="mna-badge">—</span>
      </div>
    `;

    const banner = document.createElement("div");
    banner.className = "mna-banner";

    host.appendChild(meter);
    host.appendChild(banner);
    document.body.appendChild(host);

    const refs = {
      status: meter.querySelector(".mna-meter-status"),
      toggle: meter.querySelector(".mna-toggle"),
      micDot: meter.querySelector('.mna-dot[data-kind="mic"]'),
      camDot: meter.querySelector('.mna-dot[data-kind="cam"]'),
      netDot: meter.querySelector('.mna-dot[data-kind="net"]'),
      micRow: meter.querySelector('[data-kind="mic"]'),
      camRow: meter.querySelector('[data-kind="cam"]'),
      netRow: meter.querySelector('[data-kind="net"]'),
      segments: meter.querySelectorAll(".mna-seg"),
      peak: meter.querySelector(".mna-peak"),
      micValue: meter.querySelector('[data-kind="mic"] .mna-meter-value'),
      micBadge: meter.querySelector('[data-kind="mic"] .mna-badge'),
      camFill: meter.querySelector('[data-kind="cam"] .mna-bar-fill'),
      camValue: meter.querySelector('[data-kind="cam"] .mna-meter-value'),
      camBadge: meter.querySelector('[data-kind="cam"] .mna-badge'),
      netFill: meter.querySelector('[data-kind="net"] .mna-bar-fill'),
      netValue: meter.querySelector('[data-kind="net"] .mna-meter-value'),
      netBadge: meter.querySelector('[data-kind="net"] .mna-badge'),
    };

    function applyCollapsed(collapsed) {
      sessionStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
      meter.classList.toggle("mna-collapsed", collapsed);
      meter.setAttribute("aria-expanded", collapsed ? "false" : "true");
      refs.toggle.textContent = collapsed ? "▾" : "▴";
    }

    function onMeterActivate(event) {
      event.preventDefault();
      event.stopPropagation();
      applyCollapsed(!meter.classList.contains("mna-collapsed"));
      if (toggleHandler) {
        toggleHandler();
      }
    }

    applyCollapsed(sessionStorage.getItem(COLLAPSE_KEY) !== "0");
    meter.addEventListener("click", onMeterActivate);
    meter.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        onMeterActivate(event);
      }
    });

    function paintMic(view) {
      displayedLevel = displayedLevel * 0.65 + view.mic.average * 0.35;
      const now = performance.now();
      if (view.mic.average >= peakLevel) {
        peakLevel = view.mic.average;
        peakHoldUntil = now + PEAK_HOLD_MS;
      } else if (now > peakHoldUntil) {
        peakLevel = Math.max(view.mic.average, peakLevel * 0.9);
      }

      const lit = Math.round(
        (Math.min(displayedLevel, policy.DISPLAY_CEILING) /
          policy.DISPLAY_CEILING) *
          policy.SEGMENT_COUNT,
      );
      const threshIndex = Math.round(
        (policy.NOISE_THRESHOLD / policy.DISPLAY_CEILING) *
          policy.SEGMENT_COUNT,
      );

      refs.segments.forEach((seg, i) => {
        const on = i < lit;
        seg.classList.toggle("mna-seg-on", on && i < threshIndex - 2);
        seg.classList.toggle(
          "mna-seg-warn",
          on && i >= threshIndex - 2 && i < threshIndex,
        );
        seg.classList.toggle("mna-seg-hot", on && i >= threshIndex);
      });

      refs.micValue.textContent = view.mic.ready
        ? displayedLevel.toFixed(1)
        : "—";
      refs.peak.style.opacity = peakLevel > 1 ? "1" : "0";
      refs.peak.style.left = `${Math.min((peakLevel / policy.DISPLAY_CEILING) * 100, 100)}%`;
      refs.micRow.classList.toggle("mna-row-hot", view.mic.hot);
      refs.micBadge.textContent = view.mic.badge;
      setTone(refs.micBadge, view.mic.tone);
    }

    function paintBar(fillEl, ratio, tone) {
      fillEl.style.width = `${Math.max(0, Math.min(ratio, 1)) * 100}%`;
      setTone(fillEl, tone);
    }

    function render(view) {
      meter.classList.toggle("mna-hot", view.header.hot);
      refs.status.textContent = view.header.status;
      setTone(refs.micDot, view.dots.mic);
      setTone(refs.camDot, view.dots.cam);
      setTone(refs.netDot, view.dots.net);

      if (view.banner.visible) {
        banner.textContent = view.banner.text;
        banner.style.display = "block";
      } else {
        banner.textContent = "";
        banner.style.display = "none";
      }

      paintMic(view);

      refs.camRow.classList.toggle("mna-row-hot", view.cam.hot);
      refs.camValue.textContent = view.cam.value;
      refs.camBadge.textContent = view.cam.badge;
      setTone(refs.camBadge, view.cam.tone);
      paintBar(refs.camFill, view.cam.barRatio, view.cam.barTone);

      refs.netRow.classList.toggle("mna-row-hot", view.net.hot);
      refs.netValue.textContent = view.net.value;
      refs.netBadge.textContent = view.net.badge;
      setTone(refs.netBadge, view.net.tone);
      paintBar(refs.netFill, view.net.barRatio, view.net.barTone);
    }

    return {
      render,
      onToggle(handler) {
        toggleHandler = handler;
      },
    };
  };
})(window);
