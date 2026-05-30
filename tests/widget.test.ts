// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  extractText,
  extractExecuteOutputs,
} from "../packages/widget/src/extract.js";
import { initAgent } from "../packages/widget/src/index.js";

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
