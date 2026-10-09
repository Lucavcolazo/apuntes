/**
 * Sonidos de ambiente sintetizados con Web Audio: no hay archivos que descargar,
 * funcionan offline y cada uno se puede mezclar con su propio volumen.
 */
export type SoundId = 'fan' | 'plane' | 'rain' | 'white';

export const SOUNDS: { id: SoundId; name: string }[] = [
  { id: 'fan', name: 'Ventilador' },
  { id: 'plane', name: 'Avión' },
  { id: 'rain', name: 'Gotas' },
  { id: 'white', name: 'Ruido blanco' },
];

const LOOP_SECONDS = 12;

/** Compensación medida para que, con el mismo volumen, los cuatro suenen parecido de fuerte. */
const TRIM: Record<SoundId, number> = { fan: 1.25, plane: 0.5, rain: 2.8, white: 0.8 };
const FADE = 0.8;

type Noise = 'white' | 'pink' | 'brown';

/** Ruido estéreo (canales distintos para que suene amplio) con un fundido en la unión del loop. */
function noiseBuffer(ctx: AudioContext, kind: Noise, seconds = LOOP_SECONDS) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const overlap = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = new Float32Array(length + overlap);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'white') {
        data[i] = white * 0.35;
      } else if (kind === 'pink') {
        // Filtro de Paul Kellet: aproxima -3 dB/octava.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
    }
    buffer.copyToChannel(seamless(data, length), ch);
  }
  return buffer;
}

/**
 * Loop sin "click": se genera un poco de más y ese sobrante se funde con el principio.
 * Así, después de la última muestra viene justo la que le seguía en la señal original.
 */
function seamless(raw: Float32Array, length: number) {
  const overlap = raw.length - length;
  const out = raw.slice(0, length);
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    out[i] = raw[i] * t + raw[length + i] * (1 - t);
  }
  return out;
}

/** Gotas: "plops" (seno que sube de tono y se apaga rápido) y golpecitos chicos, repartidos en estéreo. */
function dropsBuffer(ctx: AudioContext, seconds = LOOP_SECONDS) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const [L, R] = [buffer.getChannelData(0), buffer.getChannelData(1)];

  const addDrop = (t0: number, f0: number, amp: number, tau: number, pan: number) => {
    const start = Math.floor(t0 * rate);
    const dur = Math.floor(tau * 6 * rate);
    let phase = 0;
    for (let i = 0; i < dur && start + i < length; i++) {
      const t = i / rate;
      const f = f0 * (1 + 0.7 * (1 - Math.exp(-t / 0.012)));
      phase += (2 * Math.PI * f) / rate;
      const env = Math.min(1, t / 0.0015) * Math.exp(-t / tau);
      const v = Math.sin(phase) * env * amp;
      L[start + i] += v * (1 - pan);
      R[start + i] += v * pan;
    }
  };
  const addTick = (t0: number, amp: number, pan: number) => {
    const start = Math.floor(t0 * rate);
    const dur = Math.floor(0.004 * rate);
    for (let i = 0; i < dur && start + i < length; i++) {
      const v = (Math.random() * 2 - 1) * amp * Math.exp(-i / (dur / 4));
      L[start + i] += v * (1 - pan);
      R[start + i] += v * pan;
    }
  };

  for (let t = 0; t < seconds - 0.4; t += Math.random() * 0.22) {
    addDrop(t, 500 + Math.random() * 1700, 0.04 + Math.random() * 0.16, 0.018 + Math.random() * 0.03, Math.random());
  }
  for (let t = 0; t < seconds; t += Math.random() * 0.03) addTick(t, 0.02 + Math.random() * 0.05, Math.random());
  return buffer;
}

function loop(ctx: AudioContext, buffer: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7, gain = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  f.gain.value = gain;
  return f;
}

/** Variación lenta de volumen para que no suene a loop. */
function wobble(ctx: AudioContext, target: AudioParam, rate: number, depth: number) {
  const lfo = ctx.createOscillator();
  const amount = ctx.createGain();
  lfo.frequency.value = rate;
  amount.gain.value = depth;
  lfo.connect(amount).connect(target);
  lfo.start();
  return lfo;
}

/** Arma el sonido y devuelve los nodos que hay que frenar al apagarlo. */
function build(ctx: AudioContext, id: SoundId, out: AudioNode): AudioScheduledSourceNode[] {
  if (id === 'white') {
    const src = loop(ctx, noiseBuffer(ctx, 'white'));
    src.connect(filter(ctx, 'lowpass', 9000)).connect(out);
    return [src];
  }

  if (id === 'fan') {
    const body = ctx.createGain();
    body.gain.value = 0.9;
    const src = loop(ctx, noiseBuffer(ctx, 'pink'));
    src.connect(filter(ctx, 'highpass', 70)).connect(filter(ctx, 'lowpass', 950)).connect(body).connect(out);
    const lfo = wobble(ctx, body.gain, 0.3, 0.07);
    // Zumbido suave del motor.
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = 'triangle';
    hum.frequency.value = 118;
    humGain.gain.value = 0.012;
    hum.connect(filter(ctx, 'lowpass', 300)).connect(humGain).connect(out);
    hum.start();
    return [src, lfo, hum];
  }

  if (id === 'plane') {
    const rumble = ctx.createGain();
    rumble.gain.value = 1;
    const low = loop(ctx, noiseBuffer(ctx, 'brown'));
    low
      .connect(filter(ctx, 'lowpass', 480))
      .connect(filter(ctx, 'peaking', 140, 1, 6))
      .connect(rumble)
      .connect(out);
    // Siseo del aire de la cabina.
    const air = loop(ctx, noiseBuffer(ctx, 'pink'));
    const airGain = ctx.createGain();
    airGain.gain.value = 0.18;
    air.connect(filter(ctx, 'bandpass', 1100, 0.5)).connect(airGain).connect(out);
    const lfo = wobble(ctx, rumble.gain, 0.07, 0.06);
    return [low, air, lfo];
  }

  // Gotas sobre un fondo de lluvia finita.
  const bed = loop(ctx, noiseBuffer(ctx, 'pink'));
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.35;
  bed.connect(filter(ctx, 'highpass', 500)).connect(filter(ctx, 'lowpass', 5500)).connect(bedGain).connect(out);
  const drops = loop(ctx, dropsBuffer(ctx));
  drops.connect(out);
  return [bed, drops];
}

interface Channel {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
}

export class AmbientMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<SoundId, Channel>();
  private paused = false;

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      // Limitador: con todo al máximo, la mezcla no satura.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.25;
      this.master.connect(limiter).connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.master! };
  }

  /** El navegador solo deja arrancar el audio después de un clic: devuelve si quedó sonando. */
  async resume() {
    if (!this.ctx) return false;
    try {
      await this.ctx.resume();
    } catch {
      /* sin permiso todavía */
    }
    return this.ctx.state === 'running';
  }

  get blocked() {
    return !!this.ctx && this.ctx.state !== 'running' && this.channels.size > 0;
  }

  set(id: SoundId, volume: number) {
    // Apagar algo que nunca sonó no debería crear el contexto de audio.
    if (volume <= 0 && !this.channels.has(id)) return;
    const { ctx, master } = this.ensure();
    const now = ctx.currentTime;
    let ch = this.channels.get(id);
    if (volume <= 0) {
      if (!ch) return;
      ch.gain.gain.cancelScheduledValues(now);
      ch.gain.gain.setTargetAtTime(0, now, FADE / 4);
      const old = ch;
      this.channels.delete(id);
      setTimeout(() => old.nodes.forEach((n) => n.stop()), FADE * 1500);
      return;
    }
    if (!ch) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      ch = { gain, nodes: build(ctx, id, gain) };
      this.channels.set(id, ch);
    }
    // Curva cuadrática: el slider se siente más parejo al oído.
    ch.gain.gain.cancelScheduledValues(now);
    ch.gain.gain.setTargetAtTime(volume * volume * TRIM[id], now, FADE / 4);
  }

  /** Bajar todo de a poco (pausa del pomodoro) sin perder la mezcla. */
  setPaused(paused: boolean) {
    this.paused = paused;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(paused ? 0 : 1, now, (paused ? FADE * 1.5 : FADE) / 4);
  }

  get isPaused() {
    return this.paused;
  }

  async close() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    this.ctx = null;
    this.master = null;
    this.channels.clear();
    setTimeout(() => void ctx.close(), 600);
  }
}
