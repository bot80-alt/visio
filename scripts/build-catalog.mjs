// Pulls the full DummyJSON sample catalog and stores thumbnails locally so the
// app never depends on a third-party image CDN at runtime.
import { mkdir, rm, writeFile } from "node:fs/promises";

const SOURCE =
  "https://dummyjson.com/products?limit=0&select=title,category,price,thumbnail,brand,tags,description,rating,stock";

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
const { products } = await res.json();

await rm("public/catalog", { recursive: true, force: true });
await mkdir("public/catalog", { recursive: true });
await mkdir("data", { recursive: true });

const catalog = [];
for (const p of products) {
  const img = await fetch(p.thumbnail);
  if (!img.ok) {
    console.warn(`skip ${p.id}: thumbnail ${img.status}`);
    continue;
  }
  const file = `p${p.id}.webp`;
  await writeFile(`public/catalog/${file}`, Buffer.from(await img.arrayBuffer()));
  catalog.push({
    id: `p${p.id}`,
    title: p.title,
    brand: p.brand ?? null,
    category: p.category,
    tags: p.tags ?? [],
    description: p.description,
    priceCents: Math.round(p.price * 100),
    currency: "USD",
    rating: p.rating,
    stock: p.stock,
    image: `/catalog/${file}`,
  });
}

await writeFile("data/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog: ${catalog.length} products, ${new Set(catalog.map((c) => c.category)).size} categories`);
