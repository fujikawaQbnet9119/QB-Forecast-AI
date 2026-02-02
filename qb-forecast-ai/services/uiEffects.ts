
/**
 * UI Sound Effects Engine using Web Audio API
 * Generates synthetic sounds to avoid loading external assets.
 * Designed for "Rhythmic" and "Tactile" UX.
 */

const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number) => {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
};

export const playClick = () => {
    // Crisp, short "tick" sound for navigation
    playTone(800, 'sine', 0.05, 0.05);
};

export const playSelect = () => {
    // Pleasant "pop" sound for selection
    playTone(600, 'triangle', 0.1, 0.05);
    setTimeout(() => playTone(1200, 'sine', 0.1, 0.03), 50);
};

export const playSuccess = () => {
    // Ascending major chord for success
    playTone(440, 'sine', 0.2, 0.05);
    setTimeout(() => playTone(554, 'sine', 0.2, 0.05), 100);
    setTimeout(() => playTone(659, 'sine', 0.3, 0.05), 200);
};

export const playHover = () => {
    // Very subtle high freq tick for hover (optional, can be annoying if overused)
    // playTone(1200, 'sine', 0.01, 0.005);
};
