(function (global) {
  "use strict";

  const MNA = (global.MNA = global.MNA || {});

  const POLICY = {
    NOISE_THRESHOLD: 15,
    NOISE_HOLD_MS: 2000,
    IMPACT_HOLD_MS: 3000,
    RTT_ISSUE_MS: 300,
    RTT_WARN_MS: 150,
    RTT_BAR_CEILING_MS: 400,
    LOSS_WARN: 0.05,
    VIDEO_FPS_LOW: 8,
    SEGMENT_COUNT: 24,
    DISPLAY_CEILING: 48,
  };
  MNA.POLICY = POLICY;

  function emptyLatch() {
    return { since: 0, latched: false };
  }

  MNA.emptyLatches = function emptyLatches() {
    return {
      noise: emptyLatch(),
      camera: emptyLatch(),
      network: emptyLatch(),
    };
  };

  function latch(active, holdMs, slot, now) {
    if (!active) {
      return emptyLatch();
    }
    const since = slot.since || now;
    return {
      since,
      latched: slot.latched || now - since >= holdMs,
    };
  }

  function limitationLabel(reason) {
    switch (reason) {
      case "cpu":
        return " CPU";
      case "bandwidth":
        return " 帯域";
      case "none":
      case "other":
      case null:
        return "";
      default: {
        const _exhaustive = reason;
        return "";
      }
    }
  }

  function formatKbps(kbps) {
    if (kbps >= 1000) {
      return `${(kbps / 1000).toFixed(1)}M`;
    }
    return `${Math.round(kbps)}k`;
  }

  function headerStatus(issues, connected) {
    if (issues.camera || issues.network) {
      return "送信NG";
    }
    if (issues.noise) {
      return "NOISE";
    }
    if (!connected) {
      return "待機";
    }
    return "OK";
  }

  function bannerText(issues) {
    const messages = [];
    if (issues.noise) {
      messages.push("マイクが周囲の音を拾っています");
    }
    if (issues.camera) {
      messages.push("カメラ映像を Meet サーバーにうまく送れていません");
    }
    if (issues.network) {
      messages.push("Meet サーバーへの送信が不安定です");
    }
    return messages.join(" / ");
  }

  function micView(device, audio, noise) {
    if (device.mic !== "on") {
      return {
        average: audio.average,
        ready: audio.ready,
        badge: device.mic === "unknown" ? "—" : "OFF",
        tone: "",
        hot: false,
      };
    }
    return {
      average: audio.average,
      ready: audio.ready,
      badge: noise ? "NOISE" : "ON",
      tone: noise ? "hot" : "on",
      hot: noise,
    };
  }

  function camView(device, net, camera) {
    if (device.cam !== "on") {
      return {
        badge: device.cam === "unknown" ? "—" : "OFF",
        value: device.cam === "unknown" ? "—" : "OFF",
        tone: "",
        hot: false,
        barRatio: 0,
        barTone: "",
      };
    }
    if (!net.connected) {
      return {
        badge: "ON",
        value: "接続待ち",
        tone: "on",
        hot: false,
        barRatio: 0,
        barTone: "",
      };
    }

    const fps = net.videoFps;
    const reason = net.qualityLimitationReason;
    const barTone = camera ? "hot" : reason && reason !== "none" ? "warn" : "";
    let value = typeof fps === "number" ? `${Math.round(fps)}fps` : "—";
    value += limitationLabel(reason);

    return {
      badge: camera ? "劣化" : "ON",
      value,
      tone: camera ? "hot" : "on",
      hot: camera,
      barRatio: typeof fps === "number" ? Math.min(fps / 30, 1) : 0,
      barTone,
    };
  }

  function netView(net, network) {
    if (!net.connected) {
      return {
        badge: "—",
        value: "接続待ち",
        tone: "",
        hot: false,
        barRatio: 0,
        barTone: "",
      };
    }

    const rtt = net.rttMs;
    const rttText = typeof rtt === "number" ? `${Math.round(rtt)}ms` : "—";
    const barTone =
      network || (typeof rtt === "number" && rtt >= POLICY.RTT_WARN_MS)
        ? network
          ? "hot"
          : "warn"
        : "";

    return {
      badge: network ? "送信NG" : "OK",
      value: `${formatKbps(net.txKbps)} ${rttText}`,
      tone: network ? "hot" : "on",
      hot: network,
      barRatio:
        typeof rtt === "number"
          ? 1 - Math.min(rtt / POLICY.RTT_BAR_CEILING_MS, 1)
          : 0.5,
      barTone,
    };
  }

  MNA.evaluate = function evaluate(input, latches, now) {
    const device = input.device;
    const audio = input.audio;
    const net = input.net;

    const noiseActive =
      device.mic === "on" &&
      audio.ready &&
      audio.average > POLICY.NOISE_THRESHOLD;
    const cameraActive =
      device.cam === "on" &&
      net.connected &&
      (net.qualityLimitationReason === "cpu" ||
        net.qualityLimitationReason === "bandwidth" ||
        (typeof net.videoFps === "number" &&
          net.videoFps >= 0 &&
          net.videoFps < POLICY.VIDEO_FPS_LOW));
    const mediaOn = device.mic === "on" || device.cam === "on";
    const networkActive =
      net.connected &&
      mediaOn &&
      ((typeof net.rttMs === "number" && net.rttMs >= POLICY.RTT_ISSUE_MS) ||
        net.fractionLost >= POLICY.LOSS_WARN);

    const nextLatches = {
      noise: latch(noiseActive, POLICY.NOISE_HOLD_MS, latches.noise, now),
      camera: latch(
        cameraActive,
        POLICY.IMPACT_HOLD_MS,
        latches.camera,
        now,
      ),
      network: latch(
        networkActive,
        POLICY.IMPACT_HOLD_MS,
        latches.network,
        now,
      ),
    };

    const issues = {
      noise: nextLatches.noise.latched,
      camera: nextLatches.camera.latched,
      network: nextLatches.network.latched,
    };

    const sendHot = issues.camera || issues.network;
    const status = headerStatus(issues, net.connected);
    const banner = bannerText(issues);

    return {
      latches: nextLatches,
      view: {
        header: {
          status,
          hot: sendHot,
        },
        banner: {
          text: banner,
          visible: banner.length > 0,
        },
        dots: {
          mic: issues.noise ? "hot" : device.mic === "on" ? "on" : "",
          cam: issues.camera ? "hot" : device.cam === "on" ? "on" : "",
          net: issues.network ? "hot" : net.connected ? "on" : "",
        },
        mic: micView(device, audio, issues.noise),
        cam: camView(device, net, issues.camera),
        net: netView(net, issues.network),
      },
    };
  };
})(window);
