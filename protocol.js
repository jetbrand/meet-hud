(function (global) {
  "use strict";

  const MNA = (global.MNA = global.MNA || {});

  MNA.MESSAGE_SOURCE = "meet-noise-alert-net";

  MNA.emptyNet = function emptyNet() {
    return {
      connected: false,
      txKbps: 0,
      rttMs: null,
      videoFps: null,
      qualityLimitationReason: null,
      fractionLost: 0,
    };
  };

  MNA.readNetMessage = function readNetMessage(event) {
    if (event.source !== window || !event.data) {
      return null;
    }
    if (event.data.source !== MNA.MESSAGE_SOURCE) {
      return null;
    }

    const data = event.data;
    return {
      connected: Boolean(data.connected),
      txKbps: typeof data.txKbps === "number" ? Math.max(0, data.txKbps) : 0,
      rttMs: typeof data.rttMs === "number" ? data.rttMs : null,
      videoFps: typeof data.videoFps === "number" ? data.videoFps : null,
      qualityLimitationReason:
        typeof data.qualityLimitationReason === "string"
          ? data.qualityLimitationReason
          : null,
      fractionLost:
        typeof data.fractionLost === "number" ? data.fractionLost : 0,
    };
  };
})(window);
