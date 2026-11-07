// Pulls a curated slice of the DummyJSON sample catalog, assigns each product a
// visual "object" concept, and stores thumbnails locally so the demo never
// depends on a third-party image CDN at runtime.
import { mkdir, writeFile } from "node:fs/promises";

const SOURCE = "https://dummyjson.com/products?limit=0&select=title,category,price,thumbnail,brand,tags,description,rating,stock";

const OBJECT_BY_TAG = {
  perfumes: "perfume bottle",
  beds: "bed",
  sofas: "sofa",
  "bedside tables": "bedside table",
  "office chairs": "office chair",
  "photo frame": "photo frame",
  "artificial plants": "potted plant",
  "plant accessories": "plant pot",
  lighting: "table lamp",
  cups: "cup",
  glasses: "drinking glass",
  plates: "plate",
  pans: "frying pan",
  blenders: "blender",
  trays: "tray",
  laptops: "laptop",
  "men's shirts": "shirt",
  "men's t-shirts": "t-shirt",
  "athletic shoes": "sneakers",
  "casual shoes": "sneakers",
  "leather watches": "wristwatch",
  "luxury watches": "wristwatch",
  "women's watches": "wristwatch",
  "smart speakers": "smart speaker",
  "wireless earphones": "wireless earbuds",
  "over-ear headphones": "headphones",
  smartwatches: "smartwatch",
  motorcycles: "motorcycle",
  sportbikes: "motorcycle",
  scooters: "scooter",
  smartphones: "smartphone",
  basketball: "basketball",
  football: "football",
  tennis: "tennis racket",
  sunglasses: "sunglasses",
  tablets: "tablet",
  dresses: "dress",
  "girls' dresses": "dress",
  gowns: "gown",
  handbags: "handbag",
  "leather bags": "handbag",
  "designer bags": "handbag",
  backpacks: "backpack",
  suits: "suit",
  corsets: "corset dress",
  earrings: "earrings",
  slippers: "slippers",
  "heel shoes": "high heels",
  "women's shoes": "high heels",
};

const SKIP_IDS = new Set([104, 105, 108, 109, 110, 111, 112, 146, 148, 157]);
const KEEP_KITCHEN = new Set([49, 51, 59, 68, 69, 75]);
const KEEP_PHONES = new Set([123, 124, 126, 129, 133]);
const KEEP_SPORTS = new Set([140, 147, 152]);

function objectFor(p) {
  if (p.title.toLowerCase().includes("tennis ball")) return null;
  for (const tag of p.tags) if (OBJECT_BY_TAG[tag]) return OBJECT_BY_TAG[tag];
  return null;
}

function keep(p) {
  if (SKIP_IDS.has(p.id)) return false;
  if (["groceries", "beauty", "skin-care", "vehicle"].includes(p.category)) return false;
  if (p.category === "kitchen-accessories") return KEEP_KITCHEN.has(p.id);
  if (p.category === "smartphones") return KEEP_PHONES.has(p.id);
  if (p.category === "sports-accessories") return KEEP_SPORTS.has(p.id);
  return true;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
const { products } = await res.json();

await mkdir("public/catalog", { recursive: true });
await mkdir("data", { recursive: true });

const catalog = [];
for (const p of products) {
  if (!keep(p)) continue;
  const object = objectFor(p);
  if (!object) continue;
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
    object,
    description: p.description,
    priceCents: Math.round(p.price * 100),
    currency: "USD",
    rating: p.rating,
    stock: p.stock,
    image: `/catalog/${file}`,
  });
}

await writeFile("data/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog: ${catalog.length} products, ${new Set(catalog.map((c) => c.object)).size} object types`);
