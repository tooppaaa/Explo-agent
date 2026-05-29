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
            <span>{config.launcher.label}</span>
            <button className="cme-close" onClick={() => setOpen(false)} aria-label="Fermer">
              ✕
            </button>
          </div>
          <Chat backendUrl={config.backendUrl} primary={config.theme.primary} />
        </div>
      )}
    </>
  );
}
