import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

export const useAudio = () => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const { soundEnabled, soundVolume, keySoundVolume, soundPreset } = useSettingsStore();

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playKeySound = useCallback(
    (isError = false, isSpace = false) => {
      if (!soundEnabled || soundPreset === 'silent') return;

      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const masterVol = soundVolume * keySoundVolume;

      if (isError) {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        gain.gain.setValueAtTime(0.3 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (isSpace) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
        gain.gain.setValueAtTime(0.25 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else {
        let baseFreq = 600;
        let duration = 0.03;

        if (soundPreset === 'mechanical') {
          osc.type = 'square';
          baseFreq = 800 + Math.random() * 200;
          duration = 0.025;
        } else if (soundPreset === 'typewriter') {
          osc.type = 'triangle';
          baseFreq = 1200 + Math.random() * 300;
          duration = 0.04;
        } else if (soundPreset === 'pop') {
          osc.type = 'sine';
          baseFreq = 400 + Math.random() * 100;
          duration = 0.03;
        } else {
          // soft
          osc.type = 'sine';
          baseFreq = 500 + Math.random() * 100;
          duration = 0.02;
        }

        osc.frequency.setValueAtTime(baseFreq, now);
        gain.gain.setValueAtTime(0.15 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.start(now);
        osc.stop(now + duration);
      }
    },
    [soundEnabled, soundVolume, keySoundVolume, soundPreset, getAudioContext]
  );

  const playSuccessSound = useCallback(() => {
    if (!soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterVol = soundVolume;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2 * masterVol, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.2);
    });
  }, [soundEnabled, soundVolume, getAudioContext]);

  return { playKeySound, playSuccessSound };
};
