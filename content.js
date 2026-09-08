(function () {
  "use strict";

  const MNA = window.MNA;
  if (!MNA) {
    return;
  }

  let analyser = null;
  let audioStarting = false;
  let device = { mic: "unknown", cam: "unknown" };
  let audio = { ready: false, average: 0 };
  let net = MNA.emptyNet();
  let latches = MNA.emptyLatches();
  let hud;

  function sampleAverage() {
    const array = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(array);
    let values = 0;
    for (let i = 0; i < array.length; i++) {
      values += array[i];
    }
    return values / array.length;
  }

  function tick() {
    if (analyser) {
      audio.average = sampleAverage();
    }
    const result = MNA.evaluate(
      { device, audio, net },
      latches,
      performance.now(),
    );
    latches = result.latches;
    hud.render(result.view);
    requestAnimationFrame(tick);
  }

  async function initAudio() {
    if (audio.ready || audioStarting) {
      return;
    }
    audioStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audio.ready = true;
    } catch (err) {
      audio.ready = false;
      console.warn(
        "マイクへのアクセスが許可されなかったか、取得できませんでした:",
        err,
      );
    } finally {
      audioStarting = false;
    }
  }

  function boot() {
    hud = MNA.createHud();
    hud.onToggle(initAudio);
    window.addEventListener("message", (event) => {
      const next = MNA.readNetMessage(event);
      if (next) {
        net = next;
      }
    });
    device = MNA.readDeviceState();
    setInterval(() => {
      device = MNA.readDeviceState();
    }, 500);
    document.addEventListener("click", initAudio, { once: true });
    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
