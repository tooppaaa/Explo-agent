import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../packages/mock-api/src/server.js";
import { createMcpHttpApp } from "../packages/mcp-server/src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

let mockServer: Server;
let mcpServer: Server;
let mcpUrl: string;

interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

beforeAll(async () => {
  const mockApp = createApp();
  await new Promise<void>((r) => {
    mockServer = mockApp.listen(0, () => r());
  });
  const mockBase = `http://localhost:${(mockServer.address() as AddressInfo).port}`;

  const mcpApp = await createMcpHttpApp({
    providers: [{ name: "mock", openapi: specPath, baseUrl: mockBase }],
  });
  await new Promise<void>((r) => {
    mcpServer = mcpApp.listen(0, () => r());
  });
  mcpUrl = `http://localhost:${(mcpServer.address() as AddressInfo).port}/mcp`;
});

afterAll(() => {
  mockServer?.close();
  mcpServer?.close();
});

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "test", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe("MCP server (StreamableHTTP)", () => {
  it("expose exactement les 2 tools search + execute", async () => {
    const names = await withClient(async (c) => {
      const { tools } = await c.listTools();
      return tools.map((t) => t.name).sort();
    });
    expect(names).toEqual(["execute", "search"]);
  });

  it("search via MCP renvoie des hits", async () => {
    const text = await withClient(async (c) => {
      const res = (await c.callTool({ name: "search", arguments: { query: "orders" } })) as ToolResult;
      return res.content[0].text;
    });
    expect(text).toContain("mock.listOrders");
  });

  it("execute via MCP chaîne un appel et agrège", async () => {
    const text = await withClient(async (c) => {
      const res = (await c.callTool({
        name: "execute",
        arguments: { code: "const s = await api.mock.getSalesSummary({}); return s.length;" },
      })) as ToolResult;
      return res.content[0].text;
    });
    const parsed = JSON.parse(text);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.result).toBe("number");
  });
});
