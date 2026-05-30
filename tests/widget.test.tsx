// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  extractText,
  extractExecuteOutputs,
} from "../packages/widget/src/extract.js";
import { initAgent } from "../packages/widget/src/index.js";
import { ArtifactRenderer } from "../packages/widget/src/ArtifactRenderer.js";
import type { UiDescriptor } from "../packages/widget/src/ui-descriptor.js";

describe("widget — extraction d'artifacts (purs)", () => {
  it("extractText concatène les parts texte", () => {
    const msg = {
      role: "assistant",
      parts: [
        { type: "text", text: "Bonjour " },
        { type: "step-start" },
        { type: "text", text: "monde" },
      ],
    };
    expect(extractText(msg)).toBe("Bonjour monde");
  });

  it("extractExecuteOutputs récupère les sorties du tool execute", () => {
    const msg = {
      role: "assistant",
      parts: [
        { type: "text", text: "voici" },
        {
          type: "tool-execute",
          state: "output-available",
          output: {
            ok: true,
            result: [{ region: "EMEA", revenue: 100 }],
            ui: { type: "bar-chart", xKey: "region", valueKeys: ["revenue"], data: [{ region: "EMEA", revenue: 100 }] },
          },
        },
      ],
    };
    const outs = extractExecuteOutputs(msg);
    expect(outs).toHaveLength(1);
    expect(outs[0].ui?.type).toBe("bar-chart");
  });

  it("extractExecuteOutputs gère un résultat metric", () => {
    const msg = {
      role: "assistant",
      parts: [{
        type: "tool-execute",
        state: "output-available",
        output: { ok: true, ui: { type: "metric", label: "CA", value: 4521, unit: "€" } },
      }],
    };
    const outs = extractExecuteOutputs(msg);
    expect(outs[0].ui?.type).toBe("metric");
  });

  it("extractExecuteOutputs retourne ok:false en cas d'erreur", () => {
    const msg = {
      role: "assistant",
      parts: [{
        type: "tool-execute",
        state: "output-available",
        output: { ok: false, error: { message: "timeout" } },
      }],
    };
    const outs = extractExecuteOutputs(msg);
    expect(outs[0].ok).toBe(false);
    expect(outs[0].error?.message).toBe("timeout");
  });
});

describe("widget — rendu GenUI (ArtifactRenderer)", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const renderUi = (ui: UiDescriptor) => {
    const root = createRoot(container);
    act(() => {
      root.render(<ArtifactRenderer ui={ui} onAction={() => {}} />);
    });
    return root;
  };

  it("rend une métrique avec label et unité", () => {
    renderUi({ type: "metric", label: "CA Total", value: 4521, unit: "€" });
    expect(container.querySelector(".cme-metric-value")?.textContent).toContain("4521");
    expect(container.textContent).toContain("CA Total");
  });

  it("rend un metric-grid avec plusieurs items", () => {
    renderUi({
      type: "metric-grid",
      items: [
        { label: "CA", value: 100 },
        { label: "Commandes", value: 5 },
      ],
    });
    expect(container.querySelectorAll(".cme-metric-card")).toHaveLength(2);
  });

  it("rend une table avec en-têtes et lignes", () => {
    renderUi({ type: "table", data: [{ region: "EMEA", revenue: 100 }] });
    const ths = [...container.querySelectorAll("th")].map((t) => t.textContent);
    expect(ths).toEqual(["region", "revenue"]);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("rend un bouton d'action qui déclenche onAction", () => {
    const root = createRoot(container);
    let received = "";
    act(() => {
      root.render(
        <ArtifactRenderer
          ui={{ type: "button", label: "Confirmer", action: "go" }}
          onAction={(m) => { received = m; }}
        />,
      );
    });
    const btn = container.querySelector(".cme-action-btn") as HTMLButtonElement;
    expect(btn.textContent).toBe("Confirmer");
    expect(btn.type).toBe("button");
    act(() => { btn.click(); });
    expect(received).toBe("go");
  });

  it("rend un bar-chart sans faire crasher la page", () => {
    // Recharts ne peut pas mesurer le layout sous jsdom ; on vérifie surtout que
    // l'ArtifactRenderer dégrade proprement (chart OU fallback boundary), jamais
    // une exception non rattrapée qui tuerait tout le drawer.
    renderUi({
      type: "bar-chart",
      data: [{ region: "EMEA", revenue: 100 }],
      xKey: "region",
      valueKeys: ["revenue"],
    });
    const ok = container.querySelector(".cme-chart") || container.querySelector(".cme-error");
    expect(ok).toBeTruthy();
  });

  it("affiche un fallback (pas de crash) sur un type inconnu", () => {
    renderUi({ type: "wtf" } as unknown as UiDescriptor);
    expect(container.querySelector(".cme-error")).toBeTruthy();
    expect(container.textContent).toContain("non supporté");
  });
});

describe("widget — montage shadow DOM (§10.13)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("initAgent monte dans un shadow root, isolé du light DOM", async () => {
    const handle = initAgent({ apiUrl: "http://api", backendUrl: "/chat" });
    await tick();

    const host = document.querySelector("[data-code-mode-agent]")!;
    expect(host).toBeTruthy();
    expect(host.shadowRoot).toBeTruthy();

    expect(host.shadowRoot!.querySelector(".cme-launcher")).toBeTruthy();
    expect(document.querySelector(".cme-launcher")).toBeNull();

    expect(host.shadowRoot!.querySelector("style")?.textContent).toContain(":host");
    expect(document.head.querySelector("style")?.textContent ?? "").not.toContain("cme-launcher");

    handle.destroy();
    expect(document.querySelector("[data-code-mode-agent]")).toBeNull();
  });

  it("ouvre le drawer au clic sur le launcher", async () => {
    initAgent({ apiUrl: "http://api", backendUrl: "/chat" });
    await tick();
    const shadow = document.querySelector("[data-code-mode-agent]")!.shadowRoot!;
    const launcher = shadow.querySelector(".cme-launcher") as HTMLButtonElement;
    launcher.click();
    await tick();
    expect(shadow.querySelector(".cme-drawer")).toBeTruthy();
    expect(shadow.querySelector(".cme-input")).toBeTruthy();
  });
});
