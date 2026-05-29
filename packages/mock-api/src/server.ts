import express, { type Express, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}
interface Customer {
  id: string;
  name: string;
  region: string;
  tier: string;
  since: string;
}
interface OrderItem {
  productId: string;
  qty: number;
}
interface Order {
  id: string;
  customerId: string;
  region: string;
  status: string;
  total: number;
  date: string;
  items: OrderItem[];
}

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf-8")) as T;
}

const products = loadFixture<Product[]>("products.json");
const customers = loadFixture<Customer[]>("customers.json");
const orders = loadFixture<Order[]>("orders.json");

export function createApp(): Express {
  const app = express();

  // Petit log non sensible (pas de credentials : l'API mock est publique).
  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log(`[mock-api] ${req.method} ${req.url}`);
    next();
  });

  app.get("/products", (req: Request, res: Response) => {
    const { category } = req.query;
    let result = products;
    if (typeof category === "string") {
      result = result.filter((p) => p.category === category);
    }
    res.json(result);
  });

  app.get("/customers", (req: Request, res: Response) => {
    const { region, tier } = req.query;
    let result = customers;
    if (typeof region === "string") {
      result = result.filter((c) => c.region === region);
    }
    if (typeof tier === "string") {
      result = result.filter((c) => c.tier === tier);
    }
    res.json(result);
  });

  app.get("/orders", (req: Request, res: Response) => {
    const { region, status, customerId } = req.query;
    let result = orders;
    if (typeof region === "string") {
      result = result.filter((o) => o.region === region);
    }
    if (typeof status === "string") {
      result = result.filter((o) => o.status === status);
    }
    if (typeof customerId === "string") {
      result = result.filter((o) => o.customerId === customerId);
    }
    res.json(result);
  });

  app.get("/orders/:id", (req: Request, res: Response) => {
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  });

  app.get("/sales/summary", (req: Request, res: Response) => {
    const { region } = req.query;
    const considered = orders.filter(
      (o) => o.status !== "cancelled" && (typeof region !== "string" || o.region === region),
    );
    const byRegion = new Map<string, { revenue: number; orderCount: number }>();
    for (const o of considered) {
      const agg = byRegion.get(o.region) ?? { revenue: 0, orderCount: 0 };
      agg.revenue += o.total;
      agg.orderCount += 1;
      byRegion.set(o.region, agg);
    }
    const rows = [...byRegion.entries()].map(([r, agg]) => ({
      region: r,
      revenue: Math.round(agg.revenue * 100) / 100,
      orderCount: agg.orderCount,
    }));
    res.json(rows);
  });

  return app;
}

// Démarrage direct (pas en import de test).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.MOCK_API_PORT ?? 3001);
  createApp().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[mock-api] listening on http://localhost:${port}`);
  });
}
