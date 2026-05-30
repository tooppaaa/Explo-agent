/**
 * CSS injecté DANS le shadow root uniquement. Le `:host` et le reset local
 * garantissent que les styles de l'app hôte ne fuient pas dans le drawer, et
 * inversement (PRD §6.9, §10.13).
 */
export const WIDGET_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }

.cme-launcher {
  position: fixed; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%;
  border: none; cursor: pointer; color: #fff;
  font-size: 24px; box-shadow: 0 4px 12px rgba(0,0,0,.25);
}
.cme-launcher.bottom-right { right: 20px; bottom: 20px; }
.cme-launcher.bottom-left { left: 20px; bottom: 20px; }

.cme-drawer {
  position: fixed; z-index: 2147483000; top: 0; right: 0;
  height: 100%; width: 400px; max-width: 100vw;
  background: #fff; color: #111; display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,.2);
}
.cme-header {
  padding: 14px 16px; font-weight: 600; color: #fff;
  display: flex; justify-content: space-between; align-items: center;
}
.cme-close { background: transparent; border: none; color: #fff; font-size: 20px; cursor: pointer; }

.cme-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cme-msg { max-width: 100%; }
.cme-msg-user .cme-text {
  background: #eef2ff; padding: 8px 10px; border-radius: 10px; align-self: flex-end; white-space: pre-wrap;
}
.cme-msg-assistant .cme-text { padding: 8px 10px; white-space: pre-wrap; }
.cme-error { color: #b91c1c; font-size: 13px; padding: 6px 10px; }
.cme-result { background: #f8fafc; padding: 8px; border-radius: 8px; font-size: 12px; overflow-x: auto; }
.cme-chart { padding: 6px 0; }
.cme-table-wrap { overflow-x: auto; }
.cme-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.cme-table th, .cme-table td { border: 1px solid #e5e7eb; padding: 4px 8px; text-align: left; }

.cme-input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eee; }
.cme-input { flex: 1; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
.cme-send { padding: 9px 14px; border: none; border-radius: 8px; color: #fff; cursor: pointer; }
.cme-send:disabled { opacity: .5; cursor: default; }
.cme-status { font-size: 12px; color: #6b7280; padding: 0 12px 8px; }

.cme-chart-title { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }

.cme-metric-card {
  background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 12px 16px; min-width: 100px;
}
.cme-metric-value { font-size: 22px; font-weight: 700; color: #111827; line-height: 1.2; }
.cme-metric-unit { font-size: 13px; font-weight: 400; color: #6b7280; }
.cme-metric-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
.cme-metric-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0; }

.cme-action-btn {
  margin-top: 6px; padding: 9px 18px; border: none; border-radius: 8px;
  background: #4f46e5; color: #fff; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: opacity .15s;
}
.cme-action-btn:hover { opacity: .85; }
`;
