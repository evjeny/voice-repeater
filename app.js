const DEFAULT_DELAY = 10;
const $ = (id) => document.getElementById(id);
const delayInput = $('delay');
const toggleBtn = $('toggle');
const echoBox = $('echo');
const statusEl = $('status');
const meterFill = $('meter-fill');

let ctx = null;
let stream = null;
let node = null;
let analyser = null;
let rafId = 0;
let wakeLock = null;
let startedAt = 0;
let statusTimer = 0;

function store(key, value) { try { localStorage.setItem(key, value); } catch {} }
function load(key) { try { return localStorage.getItem(key); } catch { return null; } }

function readDelay() {
  const v = parseFloat(delayInput.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DELAY;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function updateRunningStatus() {
  const d = readDelay();
  const left = d - (performance.now() - startedAt) / 1000;
  setStatus(left > 0
    ? `Listening… playback starts in ${Math.ceil(left)} s`
    : `Listening · playing back ${d} s later`);
}

async function start() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setStatus('Microphone needs HTTPS (or localhost) and a modern browser.', true);
    return;
  }
  toggleBtn.disabled = true;
  setStatus('Requesting microphone…');
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    await ctx.resume();
    if (!ctx.audioWorklet) throw new Error('AudioWorklet is not supported in this browser.');

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: echoBox.checked,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    await ctx.audioWorklet.addModule('delay-processor.js');

    const source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'delay-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { delay: readDelay() },
    });
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(node).connect(ctx.destination);
    source.connect(analyser);
    await ctx.resume();

    startedAt = performance.now();
    statusTimer = setInterval(updateRunningStatus, 250);
    updateRunningStatus();
    drawMeter();
    requestWakeLock();

    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.add('running');
    echoBox.disabled = true;
  } catch (err) {
    console.error(err);
    const msg = err?.name === 'NotAllowedError'
      ? 'Microphone permission denied. Allow it in browser settings and try again.'
      : `Could not start: ${err?.message || err}`;
    await stop();
    setStatus(msg, true);
  } finally {
    toggleBtn.disabled = false;
  }
}

async function stop() {
  cancelAnimationFrame(rafId);
  clearInterval(statusTimer);
  meterFill.style.width = '0%';
  stream?.getTracks().forEach((t) => t.stop());
  if (ctx && ctx.state !== 'closed') { try { await ctx.close(); } catch {} }
  try { await wakeLock?.release(); } catch {}
  ctx = stream = node = analyser = wakeLock = null;
  toggleBtn.textContent = 'Start';
  toggleBtn.classList.remove('running');
  echoBox.disabled = false;
  setStatus('Stopped.');
}

function drawMeter() {
  const buf = new Float32Array(analyser.fftSize);
  const tick = () => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 60) / 60));
    meterFill.style.width = `${(level * 100).toFixed(1)}%`;
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx) {
    ctx.resume();
    requestWakeLock();
  }
});

delayInput.addEventListener('input', () => {
  const d = readDelay();
  store('delay', String(d));
  node?.port.postMessage({ delay: d });
});
delayInput.addEventListener('change', () => { delayInput.value = String(readDelay()); });

echoBox.addEventListener('change', () => store('echo', echoBox.checked ? '1' : '0'));

toggleBtn.addEventListener('click', () => (ctx ? stop() : start()));

// Restore saved settings.
const savedDelay = parseFloat(load('delay'));
if (Number.isFinite(savedDelay) && savedDelay >= 0) delayInput.value = String(savedDelay);
echoBox.checked = load('echo') === '1';
