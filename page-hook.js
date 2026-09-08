(function () {
  "use strict";

  const MNA = window.MNA;
  if (!MNA || !window.RTCPeerConnection) {
    return;
  }

  const POLL_MS = 1000;
  const NativePC = window.RTCPeerConnection;
  const tracked = new Set();
  const prevByPc = new WeakMap();
  const LIMIT_RANK = {
    none: 0,
    other: 1,
    cpu: 2,
    bandwidth: 3,
  };

  function track(pc) {
    tracked.add(pc);
    const forget = () => {
      if (pc.connectionState === "closed" || pc.signalingState === "closed") {
        tracked.delete(pc);
      }
    };
    pc.addEventListener("connectionstatechange", forget);
    pc.addEventListener("signalingstatechange", forget);
  }

  window.RTCPeerConnection = class RTCPeerConnection extends NativePC {
    constructor(...args) {
      super(...args);
      track(this);
    }
  };

  function bitrateKbps(bytesNow, tsNow, prevBytes, prevTs) {
    if (prevTs == null || tsNow <= prevTs) {
      return 0;
    }
    const dtSec = (tsNow - prevTs) / 1000;
    if (dtSec <= 0) {
      return 0;
    }
    return ((bytesNow - prevBytes) * 8) / dtSec / 1000;
  }

  function isScreenShare(stat) {
    return stat.contentType === "screenshare" || stat.contentType === "display";
  }

  function mediaKind(stat) {
    return stat.kind || stat.mediaType;
  }

  function isMediaOutbound(stat) {
    const kind = mediaKind(stat);
    if (kind === "audio") {
      return true;
    }
    return kind === "video" && !isScreenShare(stat);
  }

  function worseReason(current, next) {
    const nextRank = LIMIT_RANK[next] ?? 1;
    const curRank = current == null ? -1 : (LIMIT_RANK[current] ?? 1);
    return nextRank >= curRank ? next : current;
  }

  function parseStats(report, prev) {
    let bytesSent = 0;
    let hasMedia = false;
    let timestamp = 0;
    let pairRtt = null;
    let remoteRtt = null;
    let fractionLost = 0;
    let connectedPair = false;
    let minFps = null;
    let worstReason = null;

    report.forEach((stat) => {
      if (typeof stat.timestamp === "number") {
        timestamp = Math.max(timestamp, stat.timestamp);
      }

      switch (stat.type) {
        case "outbound-rtp": {
          if (!isMediaOutbound(stat)) {
            return;
          }
          hasMedia = true;
          bytesSent += stat.bytesSent || 0;
          if (mediaKind(stat) !== "video") {
            return;
          }
          if (typeof stat.framesPerSecond === "number") {
            minFps =
              minFps == null
                ? stat.framesPerSecond
                : Math.min(minFps, stat.framesPerSecond);
          }
          if (typeof stat.qualityLimitationReason === "string") {
            worstReason = worseReason(
              worstReason,
              stat.qualityLimitationReason,
            );
          }
          return;
        }
        case "remote-inbound-rtp": {
          if (typeof stat.fractionLost === "number") {
            fractionLost = Math.max(fractionLost, stat.fractionLost);
          }
          if (typeof stat.roundTripTime === "number") {
            const ms = stat.roundTripTime * 1000;
            remoteRtt = remoteRtt == null ? ms : Math.max(remoteRtt, ms);
          }
          return;
        }
        case "candidate-pair": {
          if (!(stat.nominated || stat.selected)) {
            return;
          }
          if (stat.state !== "succeeded" && stat.state !== "in-progress") {
            return;
          }
          connectedPair = true;
          if (typeof stat.currentRoundTripTime === "number") {
            pairRtt = stat.currentRoundTripTime * 1000;
          }
          return;
        }
        default:
          return;
      }
    });

    return {
      snapshot: { bytesSent, timestamp },
      hasMedia,
      bytesSent,
      txKbps: prev
        ? bitrateKbps(bytesSent, timestamp, prev.bytesSent, prev.timestamp)
        : 0,
      rttMs: pairRtt != null ? pairRtt : remoteRtt,
      videoFps: minFps,
      qualityLimitationReason: worstReason,
      fractionLost,
      connectedPair,
    };
  }

  function publish(payload) {
    window.postMessage({ source: MNA.MESSAGE_SOURCE, ...payload }, "*");
  }

  async function poll() {
    let best = null;

    for (const pc of tracked) {
      if (pc.connectionState === "closed" || pc.signalingState === "closed") {
        tracked.delete(pc);
        continue;
      }

      try {
        const report = await pc.getStats();
        const parsed = parseStats(report, prevByPc.get(pc));
        prevByPc.set(pc, parsed.snapshot);
        if (!parsed.hasMedia) {
          continue;
        }
        if (!best || parsed.bytesSent > best.bytesSent) {
          best = parsed;
        }
      } catch (_err) {
        tracked.delete(pc);
      }
    }

    if (!best) {
      publish(MNA.emptyNet());
      return;
    }

    publish({
      connected: best.connectedPair || best.bytesSent > 0 || best.txKbps > 0,
      txKbps: Math.max(0, best.txKbps),
      rttMs: best.rttMs,
      videoFps: best.videoFps,
      qualityLimitationReason: best.qualityLimitationReason,
      fractionLost: best.fractionLost,
    });
  }

  setInterval(poll, POLL_MS);
  poll();
})();
