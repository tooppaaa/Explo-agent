export const WIDGET_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
* { font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, sans-serif; margin: 0; padding: 0; }

/* ── Launcher ─────────────────────────────────────────────────────────────── */
.cme-launcher {
  position: fixed; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%;
  border: none; cursor: pointer; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  box-shadow: 0 4px 20px rgba(79,70,229,.45);
  transition: transform .2s ease, box-shadow .2s ease;
}
.cme-launcher:hover  { transform: scale(1.08); box-shadow: 0 6px 28px rgba(79,70,229,.55); }
.cme-launcher:active { transform: scale(.94); }
.cme-launcher.bottom-right { right: 24px; bottom: 24px; }
.cme-launcher.bottom-left  { left:  24px; bottom: 24px; }
.cme-launcher::before {
  content: ''; position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid #4f46e5; opacity: 0;
  animation: cme-pulse 3s ease-out 1.5s infinite;
}
@keyframes cme-pulse {
  0%   { transform: scale(1);   opacity: .7; }
  100% { transform: scale(1.6); opacity: 0;  }
}

/* ── Drawer ───────────────────────────────────────────────────────────────── */
.cme-drawer {
  position: fixed; z-index: 2147483000;
  top: 0; right: 0; height: 100%; width: 420px; max-width: 100vw;
  background: #f3f4f6; color: #111;
  display: flex; flex-direction: column;
  box-shadow: -6px 0 40px rgba(0,0,0,.14);
  animation: cme-slide-in .22s cubic-bezier(.4,0,.2,1) both;
}
@keyframes cme-slide-in {
  from { transform: translateX(100%); opacity: .6; }
  to   { transform: translateX(0);    opacity: 1;  }
}

/* ── Header ───────────────────────────────────────────────────────────────── */
.cme-header {
  height: 60px; min-height: 60px; padding: 0 14px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.cme-header-left  { display: flex; align-items: center; gap: 10px; }
.cme-header-right { display: flex; gap: 4px; }
.cme-header-avatar {
  width: 34px; height: 34px; border-radius: 10px;
  background: rgba(255,255,255,.22);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; flex-shrink: 0;
}
.cme-header-info { display: flex; flex-direction: column; gap: 1px; }
.cme-header-title { font-weight: 600; font-size: 14px; color: #fff; }
.cme-header-status { font-size: 11px; color: rgba(255,255,255,.7); display: flex; align-items: center; gap: 4px; }
.cme-header-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
  box-shadow: 0 0 0 2px rgba(74,222,128,.3);
}
.cme-header-btn {
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.15); color: #fff; cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.cme-header-btn:hover { background: rgba(255,255,255,.28); }

/* ── Messages ─────────────────────────────────────────────────────────────── */
.cme-messages {
  flex: 1; overflow-y: auto; padding: 14px 12px;
  display: flex; flex-direction: column; gap: 12px;
  scroll-behavior: smooth;
}
.cme-messages::-webkit-scrollbar { width: 4px; }
.cme-messages::-webkit-scrollbar-track { background: transparent; }
.cme-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }

/* empty state */
.cme-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 32px 16px; gap: 14px; text-align: center;
}
.cme-empty-icon  { font-size: 40px; }
.cme-empty-title { font-size: 15px; font-weight: 600; color: #374151; }
.cme-empty-sub   { font-size: 13px; color: #9ca3af; max-width: 280px; line-height: 1.5; }
.cme-suggestions { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 340px; }
.cme-suggestion {
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; color: #374151;
  cursor: pointer; text-align: left;
  transition: border-color .15s, background .15s, transform .1s;
  box-shadow: 0 1px 3px rgba(0,0,0,.05);
}
.cme-suggestion:hover { border-color: #4f46e5; background: #faf9ff; transform: translateY(-1px); }

/* message rows */
.cme-msg { display: flex; flex-direction: column; max-width: 100%; gap: 4px; }
.cme-msg-user      { align-items: flex-end; }
.cme-msg-assistant { align-items: flex-start; }

/* user bubble */
.cme-msg-user .cme-text {
  background: #4f46e5; color: #fff;
  padding: 10px 14px; border-radius: 18px 18px 4px 18px;
  font-size: 14px; line-height: 1.55; white-space: pre-wrap;
  max-width: 82%; word-break: break-word;
  box-shadow: 0 2px 8px rgba(79,70,229,.25);
}

/* assistant row + bubble */
.cme-assistant-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
.cme-avatar {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; margin-top: 2px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; box-shadow: 0 1px 4px rgba(79,70,229,.3);
}
.cme-assistant-content { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.cme-msg-assistant .cme-text {
  background: #fff; color: #1f2937;
  padding: 10px 14px; border-radius: 4px 18px 18px 18px;
  font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  box-shadow: 0 1px 4px rgba(0,0,0,.07);
  border: 1px solid #ebebf0;
}

/* ── Typing indicator ─────────────────────────────────────────────────────── */
.cme-typing { display: flex; align-items: flex-start; gap: 8px; }
.cme-typing-bubble {
  background: #fff; border: 1px solid #ebebf0;
  border-radius: 4px 18px 18px 18px;
  padding: 12px 16px; display: flex; gap: 5px; align-items: center;
  box-shadow: 0 1px 4px rgba(0,0,0,.07);
}
.cme-dot { width: 7px; height: 7px; border-radius: 50%; background: #c4c4d0; }
.cme-dot:nth-child(1) { animation: cme-bounce .9s ease-in-out infinite; }
.cme-dot:nth-child(2) { animation: cme-bounce .9s ease-in-out .15s infinite; }
.cme-dot:nth-child(3) { animation: cme-bounce .9s ease-in-out .3s infinite; }
@keyframes cme-bounce {
  0%, 60%, 100% { transform: translateY(0);   background: #c4c4d0; }
  30%           { transform: translateY(-6px); background: #4f46e5; }
}

/* tool status */
.cme-tool-status {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; color: #6b7280;
  background: #fff; border: 1px solid #ebebf0;
  border-radius: 8px; padding: 7px 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05);
  align-self: flex-start;
}
.cme-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid #e5e7eb; border-top-color: #4f46e5;
  animation: cme-spin .7s linear infinite; flex-shrink: 0;
}
@keyframes cme-spin { to { transform: rotate(360deg); } }

/* ── Error ────────────────────────────────────────────────────────────────── */
.cme-error {
  background: #fef2f2; border: 1px solid #fecaca;
  color: #dc2626; font-size: 13px; line-height: 1.5;
  padding: 8px 12px; border-radius: 10px; max-width: 88%;
}

/* ── Artifact card ────────────────────────────────────────────────────────── */
.cme-artifact-card {
  background: #fff; border: 1px solid #e8eaed;
  border-radius: 12px; padding: 14px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  width: 100%; overflow: hidden;
}

/* ── Chart ────────────────────────────────────────────────────────────────── */
.cme-chart { padding: 2px 0; }
.cme-chart-title { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; }

/* ── Table ────────────────────────────────────────────────────────────────── */
.cme-table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid #e5e7eb; }
.cme-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.cme-table th { background: #f8f9fb; padding: 8px 10px; font-weight: 600; color: #374151; text-align: left; border-bottom: 1px solid #e5e7eb; }
.cme-table td { padding: 7px 10px; color: #4b5563; border-bottom: 1px solid #f3f4f6; }
.cme-table tr:last-child td { border-bottom: none; }
.cme-table tr:hover td { background: #f9fafb; }

/* ── Metrics ──────────────────────────────────────────────────────────────── */
.cme-metric-card {
  background: #fff; border: 1px solid #e8eaed; border-radius: 10px; padding: 14px 16px;
}
.cme-metric-value  { font-size: 26px; font-weight: 700; color: #111827; line-height: 1.1; }
.cme-metric-unit   { font-size: 14px; font-weight: 400; color: #6b7280; }
.cme-metric-label  { font-size: 11px; color: #9ca3af; margin-top: 4px; letter-spacing: .3px; text-transform: uppercase; }
.cme-metric-grid   { display: flex; flex-wrap: wrap; gap: 8px; }

/* ── Action button ────────────────────────────────────────────────────────── */
.cme-action-btn {
  padding: 10px 20px; border: none; border-radius: 10px;
  background: #4f46e5; color: #fff; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: opacity .15s, transform .1s;
  box-shadow: 0 2px 10px rgba(79,70,229,.3);
}
.cme-action-btn:hover  { opacity: .9; transform: translateY(-1px); }
.cme-action-btn:active { transform: translateY(0); }

/* ── Result (JSON fallback) ───────────────────────────────────────────────── */
.cme-result {
  background: #f8fafc; border: 1px solid #e5e7eb;
  padding: 10px 12px; border-radius: 8px; font-size: 12px;
  font-family: ui-monospace, 'Cascadia Code', monospace;
  overflow-x: auto; max-height: 180px; overflow-y: auto; color: #374151;
}

/* ── Input area ───────────────────────────────────────────────────────────── */
.cme-input-area { border-top: 1px solid #e8eaed; padding: 12px; background: #fff; flex-shrink: 0; }
.cme-input-row  { display: flex; gap: 8px; align-items: flex-end; }
.cme-input {
  flex: 1; padding: 10px 14px;
  border: 1.5px solid #e5e7eb; border-radius: 12px;
  font-size: 14px; color: #111; background: #fafafa;
  resize: none; min-height: 42px; max-height: 120px;
  line-height: 1.5; outline: none; overflow-y: auto;
  transition: border-color .15s, background .15s, box-shadow .15s;
  font-family: inherit;
}
.cme-input:focus { border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 3px rgba(79,70,229,.08); }
.cme-input::placeholder { color: #b0b0bc; }
.cme-send {
  width: 42px; height: 42px; border: none; border-radius: 12px; color: #fff;
  cursor: pointer; font-size: 18px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s, transform .1s;
  box-shadow: 0 2px 8px rgba(79,70,229,.25);
}
.cme-send:hover:not(:disabled)  { opacity: .9; transform: translateY(-1px); }
.cme-send:active:not(:disabled) { transform: translateY(0); }
.cme-send:disabled { opacity: .35; cursor: default; }
.cme-input-hint { font-size: 11px; color: #d1d5db; margin-top: 6px; text-align: right; }
`;
