(function (global) {
  "use strict";

  const MNA = (global.MNA = global.MNA || {});

  function buttonLabel(el) {
    return el.getAttribute("aria-label") || el.getAttribute("data-tooltip") || "";
  }

  function mentions(kind, text) {
    switch (kind) {
      case "mic":
        return (
          /microphone|マイク/.test(text) &&
          !/speaker|スピーカー|volume/.test(text)
        );
      case "cam":
        return (
          /camera|カメラ/.test(text) &&
          !/effect|エフェクト|present|screenshare|画面を共有|背景/.test(text)
        );
      default: {
        const _exhaustive = kind;
        return false;
      }
    }
  }

  function parseToggleOn(label) {
    const text = label.toLowerCase();
    if (/unmute|turn on|オンにする|ミュートを解除/.test(text)) {
      return false;
    }
    if (/mute|turn off|オフにする/.test(text)) {
      return true;
    }
    return null;
  }

  function pickBottomMost(elements) {
    let best = null;
    let bestY = -Infinity;
    for (const el of elements) {
      const y = el.getBoundingClientRect().top;
      if (y > bestY) {
        bestY = y;
        best = el;
      }
    }
    return best;
  }

  function readIsMuted(el) {
    const host = el.closest("[data-is-muted]") || el;
    const muted = host.getAttribute("data-is-muted");
    if (muted === "true") {
      return true;
    }
    if (muted === "false") {
      return false;
    }
    return null;
  }

  function readOne(kind) {
    const candidates = [];
    const nodes = document.querySelectorAll(
      'button[aria-label], [role="button"][aria-label]',
    );
    for (const el of nodes) {
      if (mentions(kind, buttonLabel(el))) {
        candidates.push(el);
      }
    }

    const el = pickBottomMost(candidates);
    if (!el) {
      return "unknown";
    }

    const muted = readIsMuted(el);
    if (muted === true) {
      return "off";
    }
    if (muted === false) {
      return "on";
    }

    const fromLabel = parseToggleOn(buttonLabel(el));
    if (fromLabel === true) {
      return "on";
    }
    if (fromLabel === false) {
      return "off";
    }
    return "unknown";
  }

  MNA.readDeviceState = function readDeviceState() {
    return {
      mic: readOne("mic"),
      cam: readOne("cam"),
    };
  };
})(window);
