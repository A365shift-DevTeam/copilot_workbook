import { useEffect, useRef, useState } from 'react';

const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

function playChime() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ctx = new C(); ctx.resume();
    [660, 880].forEach((freq, i) => { const o = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + i * 0.22; o.type = 'sine'; o.frequency.value = freq; gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.13, t + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(gain).connect(ctx.destination); o.start(t); o.stop(t + 0.2); });
    setTimeout(() => ctx.close().catch(() => {}), 1300);
  } catch { /* audio unavailable */ }
}

// Accurate countdown: based on wall-clock time, not interval tick counts.
export default function Timer({ chime, notify, modalOpenRef, closeModalRef }) {
  const [durationSec, setDurationSec] = useState(180);
  const [remainingMs, setRemainingMs] = useState(180000);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState('3');
  const [modalOpen, setModalOpen] = useState(false);
  const [mins, setMins] = useState('3');
  const [secs, setSecs] = useState('0');
  const endTime = useRef(0), minsRef = useRef(), chimeRef = useRef(chime), notifyRef = useRef(notify);
  chimeRef.current = chime; notifyRef.current = notify;
  modalOpenRef.current = modalOpen; closeModalRef.current = () => setModalOpen(false);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, endTime.current - Date.now()); setRemainingMs(left);
      if (left === 0) { setRunning(false); setFinished(true); if (chimeRef.current) playChime(); notifyRef.current("Time's up! Move to the next exercise."); }
    };
    const id = setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [running]);

  function setDuration(sec, sel) { setRunning(false); setDurationSec(sec); setRemainingMs(sec * 1000); setSelected(sel); setFinished(false); }
  function startPause() {
    if (running) { setRemainingMs(Math.max(0, endTime.current - Date.now())); setRunning(false); return; }
    let ms = remainingMs; if (finished || ms <= 0) { ms = durationSec * 1000; setFinished(false); setRemainingMs(ms); }
    endTime.current = Date.now() + ms; setRunning(true);
  }
  function openCustom() { setMins(String(Math.floor(durationSec / 60))); setSecs(String(durationSec % 60)); setModalOpen(true); setTimeout(() => minsRef.current?.focus(), 20); }
  function submitCustom(e) {
    e.preventDefault(); const m = Number(mins), s = Number(secs);
    if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || m > 180 || s < 0 || s > 59 || (m === 0 && s === 0)) { notify('Enter a duration between 1 second and 180:59.'); return; }
    setDuration(m * 60 + s, 'custom'); setModalOpen(false); notify('Custom timer set.');
  }

  const paused = remainingMs < durationSec * 1000;
  return (
    <>
      <section className={'timer-card' + (finished ? ' ended' : '')} aria-label="Practice countdown timer">
        <div className="timer-top"><div className="timer-display" aria-live="off">{fmt(remainingMs)}</div><div className="timer-status" aria-live="polite"><span className="status-dot" /><span>{finished ? "Time's up!" : running ? 'Practice in progress' : paused ? 'Paused' : 'Ready to practice'}</span></div></div>
        <div className="timer-actions">
          <div className="timer-presets">
            <button className={'btn' + (selected === '3' ? ' chosen' : '')} type="button" onClick={() => setDuration(180, '3')}>3 min</button>
            <button className={'btn' + (selected === '5' ? ' chosen' : '')} type="button" onClick={() => setDuration(300, '5')}>5 min</button>
            <button className={'btn' + (selected === 'custom' ? ' chosen' : '')} type="button" onClick={openCustom}>Custom</button>
          </div>
          <div className="run-actions">
            <button className="btn primary" type="button" onClick={startPause}>{running ? 'Pause' : paused && !finished ? 'Resume' : 'Start'}</button>
            <button className="btn" type="button" onClick={() => { setRunning(false); setRemainingMs(durationSec * 1000); setFinished(false); }}>Reset</button>
          </div>
        </div>
        <div className="progress-track"><div className="progress" style={{ width: Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) * 100 + '%' }} /></div>
      </section>
      <div className={'modal-backdrop' + (modalOpen ? ' open' : '')} role="presentation" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
        <form className="modal-box" role="dialog" aria-modal="true" aria-labelledby="timeModalTitle" onSubmit={submitCustom}>
          <h2 id="timeModalTitle">Custom timer</h2><p>Choose your audience practice duration.</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><label className="field-label" htmlFor="timeMinutes">Minutes</label><input ref={minsRef} className="form-field" id="timeMinutes" type="number" min="0" max="180" required value={mins} onChange={e => setMins(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="field-label" htmlFor="timeSeconds">Seconds</label><input className="form-field" id="timeSeconds" type="number" min="0" max="59" required value={secs} onChange={e => setSecs(e.target.value)} /></div>
          </div>
          <div className="modal-actions"><button className="btn" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn primary" type="submit">Set timer</button></div>
        </form>
      </div>
    </>
  );
}
