// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  extractText,
  extractExecuteOutputs,
  toChartData,
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
          output: { ok: true, result: [{ region: "EMEA", revenue: 100 }], artifactHint: "chart" },
        },
      ],
    };
    const outs = extractExecuteOutputs(msg);
    expect(outs).toHaveLength(1);
    expect(outs[0].artifactHint).toBe("chart");
  });

  it("toChartData mappe un tableau d'objets numériques vers des séries", () => {
    const chart = toChartData([
      { region: "EMEA", revenue: 100, orders: 3 },
      { region: "AMER", revenue: 250, orders: 5 },
    ]);
    expect(chart).not.toBeNull();
    expect(chart!.xKey).toBe("region");
    expect(chart!.numericKeys.sort()).toEqual(["orders", "revenue"]);
    expect(chart!.rows).toHaveLength(2);
  });

  it("toChartData renvoie null pour un résultat non charteable", () => {
    expect(toChartData("just text")).toBeNull();
    expect(toChartData([{ name: "a" }, { name: "b" }])).toBeNull();
    expect(toChartData([])).toBeNull();
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

    // Le launcher vit DANS le shadow root, pas dans le light DOM.
    expect(host.shadowRoot!.querySelector(".cme-launcher")).toBeTruthy();
    expect(document.querySelector(".cme-launcher")).toBeNull();

    // Le CSS du widget est injecté dans le shadow, pas dans le document hôte.
    expect(host.shadowRoot!.querySelector("style")?.textContent).toContain(":host");
    expect(document.head.querySelector("style")?.textContent ?? "").not.toContain(
      "cme-launcher",
    );

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
