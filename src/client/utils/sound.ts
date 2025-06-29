import { loadSoundSetting, saveSoundSetting } from './storage.js';

let soundEnabled = loadSoundSetting();
let audioContext: AudioContext | null = null;

// Initialize audio context
function getAudioContext(): AudioContext | null {
  if (!audioContext && typeof AudioContext !== 'undefined') {
    // Support both standard and prefixed constructors without relying on `any`
    type AudioCtxConstructor = typeof AudioContext;
    const AudioConstructor: AudioCtxConstructor | undefined =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: AudioCtxConstructor }).webkitAudioContext;

    if (AudioConstructor) {
      audioContext = new AudioConstructor();
    }
  }
  return audioContext;
}

function playTone(
  freq = 600,
  durationMs = 150,
  volume = 0.15,
  type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Ignore playback errors (e.g., user has not interacted yet)
  }
}

export function playSound(eventName: string): void {
  if (!soundEnabled) return;

  switch (eventName) {
    case 'vote':
      playTone(600, 120, 0.2);
      break;
    case 'reveal':
      playTone(800, 200, 0.25, 'square');
      break;
    case 'countdown':
      playTone(500, 180, 0.25, 'sawtooth');
      break;
    case 'consensus':
      // Two quick beeps for consensus
      playTone(1000, 120, 0.3, 'triangle');
      setTimeout(() => playTone(1200, 120, 0.3, 'triangle'), 130);
      break;
    case 'ticket':
      playTone(650, 150, 0.22, 'square');
      break;
    case 'chat':
      playTone(750, 100, 0.15, 'sine');
      break;
  }
}

export function toggleSound(): boolean {
  soundEnabled = !soundEnabled;
  saveSoundSetting(soundEnabled);
  return soundEnabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function updateSoundIcon(): void {
  const el = document.getElementById('sound-toggle');
  if (!el) return;
  el.textContent = soundEnabled ? '🔊' : '🔇';
  el.title = soundEnabled ? 'Sound on' : 'Sound off';
}
