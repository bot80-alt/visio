import { COLORS } from "./concepts";

// Everyday words people use for the catalog's object concepts. Longer phrases
// are matched first so "smart speaker" wins over "speaker".
const SYNONYMS: Record<string, string> = {
  "table lamp": "table lamp",
  "desk lamp": "table lamp",
  lamp: "table lamp",
  light: "table lamp",
  "over-ear headphones": "headphones",
  headphones: "headphones",
  headphone: "headphones",
  headset: "headphones",
  cans: "headphones",
  earbuds: "wireless earbuds",
  airpods: "wireless earbuds",
  earphones: "wireless earbuds",
  sunglasses: "sunglasses",
  shades: "sunglasses",
  glasses: "sunglasses",
  "drinking glass": "drinking glass",
  tumbler: "drinking glass",
  "smart watch": "smartwatch",
  smartwatch: "smartwatch",
  "apple watch": "smartwatch",
  wristwatch: "wristwatch",
  watch: "wristwatch",
  rolex: "wristwatch",
  sneakers: "sneakers",
  sneaker: "sneakers",
  trainers: "sneakers",
  kicks: "sneakers",
  jordans: "sneakers",
  shoes: "sneakers",
  heels: "high heels",
  "high heels": "high heels",
  pumps: "high heels",
  slippers: "slippers",
  motorcycle: "motorcycle",
  motorbike: "motorcycle",
  bike: "motorcycle",
  sportbike: "motorcycle",
  scooter: "scooter",
  phone: "smartphone",
  smartphone: "smartphone",
  iphone: "smartphone",
  handbag: "handbag",
  purse: "handbag",
  bag: "handbag",
  clutch: "handbag",
  backpack: "backpack",
  rucksack: "backpack",
  "potted plant": "potted plant",
  plant: "potted plant",
  "plant pot": "plant pot",
  planter: "plant pot",
  pot: "plant pot",
  "office chair": "office chair",
  chair: "office chair",
  sofa: "sofa",
  couch: "sofa",
  "bedside table": "bedside table",
  nightstand: "bedside table",
  "side table": "bedside table",
  bed: "bed",
  laptop: "laptop",
  macbook: "laptop",
  notebook: "laptop",
  "smart speaker": "smart speaker",
  speaker: "smart speaker",
  perfume: "perfume bottle",
  fragrance: "perfume bottle",
  cologne: "perfume bottle",
  gown: "gown",
  "corset dress": "corset dress",
  corset: "corset dress",
  dress: "dress",
  frock: "dress",
  suit: "suit",
  "t-shirt": "t-shirt",
  tshirt: "t-shirt",
  tee: "t-shirt",
  shirt: "shirt",
  flannel: "shirt",
  earrings: "earrings",
  earring: "earrings",
  cup: "cup",
  mug: "cup",
  plate: "plate",
  tray: "tray",
  pan: "frying pan",
  blender: "blender",
  "photo frame": "photo frame",
  frame: "photo frame",
  picture: "photo frame",
  tablet: "tablet",
  ipad: "tablet",
  basketball: "basketball",
  football: "football",
  "tennis racket": "tennis racket",
  racket: "tennis racket",
};

const COLOR_SYNONYMS: Record<string, string> = {
  gray: "grey",
  golden: "gold",
  brass: "gold",
  steel: "silver",
  chrome: "silver",
  crimson: "red",
  navy: "blue",
  teal: "blue",
  olive: "green",
  emerald: "green",
  tan: "brown",
  leather: "brown",
  ivory: "white",
  cream: "white",
  rose: "pink",
  matte: "black",
};

const SORTED_SYNONYMS = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findObject(text: string, known: string[]): string | null {
  const t = text.toLowerCase();
  for (const o of [...known].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${escape(o)}s?\\b`).test(t)) return o;
  }
  for (const word of SORTED_SYNONYMS) {
    if (new RegExp(`\\b${escape(word)}\\b`).test(t) && known.includes(SYNONYMS[word])) {
      return SYNONYMS[word];
    }
  }
  return null;
}

export function findColor(text: string): string | null {
  const t = text.toLowerCase();
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`).test(t)) return c;
  for (const [word, c] of Object.entries(COLOR_SYNONYMS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return c;
  }
  return null;
}

export function findMaxPriceCents(text: string): number | null {
  const m = text.toLowerCase().match(/(?:under|below|less than|max|cheaper than|up to|<)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

const ORDINALS: Record<string, number> = {
  first: 0,
  "1st": 0,
  second: 1,
  "2nd": 1,
  third: 2,
  "3rd": 2,
  fourth: 3,
  "4th": 3,
  last: -1,
};

export type RuleIntent =
  | { kind: "buy"; index: number | null; quantity: number }
  | { kind: "cheaper" }
  | { kind: "search"; object: string | null; color: string | null; maxPriceCents: number | null }
  | { kind: "help" };

export function parseIntent(text: string, known: string[]): RuleIntent {
  const t = text.toLowerCase().trim();
  const buy = /\b(buy|purchase|checkout|check out|order (it|this|that|one|the)|i'?ll take|get (it|this|that|the)|add to cart|pay for)\b/.test(t);
  if (buy) {
    let index: number | null = null;
    const hash = t.match(/#\s*(\d)/);
    if (hash) index = parseInt(hash[1], 10) - 1;
    for (const [w, i] of Object.entries(ORDINALS)) {
      if (index == null && new RegExp(`\\b${w}\\b`).test(t)) index = i;
    }
    const qty = t.match(/\b(\d)\s*(x|of|pcs|pieces|units)\b/) ?? t.match(/\bx\s*(\d)\b/);
    const quantity = qty ? Math.min(5, Math.max(1, parseInt(qty[1], 10))) : 1;
    return { kind: "buy", index, quantity };
  }
  const object = findObject(t, known);
  const color = findColor(t);
  const maxPriceCents = findMaxPriceCents(t);
  if (!object && !color && maxPriceCents == null && /\b(cheaper|less expensive|budget|affordable)\b/.test(t)) {
    return { kind: "cheaper" };
  }
  if (!object && !color && maxPriceCents == null && /^(hi|hello|hey|help|what can you do)/.test(t)) {
    return { kind: "help" };
  }
  return { kind: "search", object, color, maxPriceCents };
}
