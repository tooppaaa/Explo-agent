import { useState } from "react";
import { Chat } from "./Chat.js";
import type { ResolvedWidgetConfig } from "./index.js";

export function App({ config }: { config: ResolvedWidgetConfig }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          className={`cme-launcher ${config.launcher.position}`}
          style={{ background: config.theme.primary }}
          onClick={() => setOpen(true)}
          aria-label={config.launcher.label}
          title={config.launcher.label}
        >
          💬
        </button>
      )}
      {open && (
        <div className="cme-drawer">
          <div className="cme-header" style={{ background: config.theme.primary }}>
            <div className="cme-header-left">
              <div className="cme-header-avatar">🤖</div>
              <div className="cme-header-info">
                <div className="cme-header-title">{config.launcher.label}</div>
                <div className="cme-header-status">
                  <span className="cme-header-dot" />
                  En ligne
                </div>
              </div>
            </div>
            <div className="cme-header-right">
              <button className="cme-header-btn" onClick={() => setOpen(false)} aria-label="Fermer" title="Fermer">
                ✕
              </button>
            </div>
          </div>
          <Chat backendUrl={config.backendUrl} primary={config.theme.primary} />
        </div>
      )}
    </>
  );
}
