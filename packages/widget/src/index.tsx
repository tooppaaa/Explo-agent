import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { WIDGET_CSS } from "./styles.js";

/**
 * Point d'entrée du widget embarquable (PRD §6.9).
 * Expose `window.initAgent(config)` : injecte un launcher + drawer dans un
 * SHADOW DOM, isolé du CSS de l'app hôte (et inversement).
 */

export interface InitAgentConfig {
  /** Identifie l'API cible ; mappée à un provider configuré côté backend. */
  apiUrl: string;
  /** Endpoint du chat backend. Défaut: même origine, /chat. */
  backendUrl?: string;
  launcher?: { position?: "bottom-right" | "bottom-left"; label?: string };
  theme?: { primary?: string };
  mount?: "shadow" | "iframe"; // M0 : "shadow" uniquement.
}

export interface ResolvedWidgetConfig {
  apiUrl: string;
  backendUrl: string;
  launcher: { position: "bottom-right" | "bottom-left"; label: string };
  theme: { primary: string };
}

function resolve(config: InitAgentConfig): ResolvedWidgetConfig {
  return {
    apiUrl: config.apiUrl,
    backendUrl: config.backendUrl ?? "/chat",
    launcher: {
      position: config.launcher?.position ?? "bottom-right",
      label: config.launcher?.label ?? "Assistant",
    },
    theme: { primary: config.theme?.primary ?? "#4f46e5" },
  };
}

export function initAgent(config: InitAgentConfig): { destroy: () => void } {
  const resolved = resolve(config);

  // Hôte + shadow root : isolation CSS bidirectionnelle (PRD §10.13).
  const host = document.createElement("div");
  host.setAttribute("data-code-mode-agent", "");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<App config={resolved} />);

  return {
    destroy() {
      root.unmount();
      host.remove();
    },
  };
}

declare global {
  interface Window {
    initAgent: typeof initAgent;
  }
}

if (typeof window !== "undefined") {
  window.initAgent = initAgent;
}
