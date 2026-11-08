// ===================================================================
// sounds.js – lyde når der trækkes, slås, gives skak osv.
// Vi bruger ingen lydfiler. Lydene laves direkte i browseren med
// Web Audio API: et kort "støj-klik" lyder som en træbrik mod brættet.
// ===================================================================

let audioCtx = null;

// Browseren må først lave lyd, når brugeren har klikket på siden.
// Derfor laver vi først "lydmotoren", når den første lyd skal spilles.
function getAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null; // meget gammel browser: ingen lyd
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Et "tok" – som en brik der sættes ned på brættet.
// Lavet af en kort bid filtreret støj + en lav "bump"-tone.
function tap(ctx, time, options = {}) {
  const { freq = 1100, gain = 0.9, decay = 0.05, thump = 170 } = options;

  // 1) Kort støj der hurtigt dør ud
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Filteret gør støjen til et "træ-agtigt" klik
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(gain, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decay + 0.03);

  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(time);

  // 2) Lav tone der falder – giver "tyngde" til klikket
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(thump, time);
  osc.frequency.exponentialRampToValueAtTime(thump * 0.5, time + 0.06);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(gain * 0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.1);
}

// En ren tone (bruges til skak, start og slut på partiet).
function tone(ctx, time, freq, duration, gain = 0.12, type = "sine") {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

// Spiller en lyd ud fra navnet, fx playSound("capture").
function playSound(name) {
  if (!settings.sounds) return; // lyd er slået fra i indstillingerne
  const ctx = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;

  switch (name) {
    case "move":
      tap(ctx, t);
      break;
    case "capture": // to hurtige klik – lyder hårdere
      tap(ctx, t, { freq: 900, gain: 1.2 });
      tap(ctx, t + 0.045, { freq: 1400, gain: 0.7 });
      break;
    case "castle": // konge og tårn: to klik efter hinanden
      tap(ctx, t);
      tap(ctx, t + 0.09, { freq: 1250 });
      break;
    case "check":
      tap(ctx, t);
      tone(ctx, t, 880, 0.2, 0.1, "triangle");
      break;
    case "promote":
      tap(ctx, t);
      tone(ctx, t, 660, 0.12);
      tone(ctx, t + 0.08, 990, 0.18);
      break;
    case "start": // to toner der går op
      tone(ctx, t, 523, 0.15);
      tone(ctx, t + 0.12, 784, 0.3);
      break;
    case "end": // to toner der går ned
      tone(ctx, t, 784, 0.15);
      tone(ctx, t + 0.13, 523, 0.35);
      break;
    case "lowtime": // advarsel når tiden er ved at løbe ud
      tone(ctx, t, 1000, 0.08, 0.08, "square");
      tone(ctx, t + 0.12, 1000, 0.08, 0.08, "square");
      break;
  }
}