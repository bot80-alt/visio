// Lightweight, deterministic parsing for the parts of a request that need to be
// exact (budgets, ordinals, quantities, purchase verbs). Everything about *what*
// the user wants is left to the embedding models.

export const COLORS = [
  "black",
  "white",
  "silver",
  "gold",
  "red",
  "blue",
  "green",
  "grey",
  "brown",
  "pink",
  "purple",
  "yellow",
  "orange",
] as const;

const COLOR_SYNONYMS: Record<string, string> = {
  gray: "grey",
  golden: "gold",
  brass: "gold",
  chrome: "silver",
  crimson: "red",
  scarlet: "red",
  navy: "blue",
  teal: "blue",
  olive: "green",
  emerald: "green",
  tan: "brown",
  ivory: "white",
  cream: "white",
  rose: "pink",
  violet: "purple",
};

export function findColor(text: string): string | null {
  const t = text.toLowerCase();
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`).test(t)) return c;
  for (const [word, c] of Object.entries(COLOR_SYNONYMS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return c;
  }
  return null;
}

export function findMaxPriceCents(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/(?:under|below|less than|max|cheaper than|up to|within|<)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?/);
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
  | { kind: "help" }
  | { kind: "search"; color: string | null; maxPriceCents: number | null };

const REFINEMENT =
  /^(?:(?:but|and|now|ok|okay|actually|maybe|hmm)[\s,]+)?(?:(?:in|a|the|any|something|one)\s+)?(?:(?:more|less|cheaper|lighter|darker|bigger|smaller|longer|shorter|different|another|other)\b|(?:with|without|in|under|below|less than|up to)\b)|^(?:[a-z]+\s+)?(?:instead|version|color|colour)\b/i;

/** Short follow-ups like "in black", "under $50" or "without the strap" refine the active description. */
export function isRefinement(text: string): boolean {
  const t = text.trim().toLowerCase();
  const words = t.split(/\s+/).length;
  if (words > 8) return false;
  if (REFINEMENT.test(t)) return true;
  if (words > 4 || (findColor(t) === null && findMaxPriceCents(t) === null)) return false;
  // "black one please" refines; "red lipstick" names a new product.
  const colorWords = [...COLORS, ...Object.keys(COLOR_SYNONYMS)].join("|");
  const rest = t
    .replace(/(?:under|below|less than|max|up to|within|<)\s*\$?\s*[\d,]+(?:\.\d+)?\s*k?/g, " ")
    .replace(new RegExp(`\\b(?:${colorWords})\\b`, "g"), " ")
    .replace(/\b(?:in|a|an|the|one|ones|please|version|instead|maybe|but|and|now|or|ish|color|colour|same|it|that)\b/g, " ")
    .replace(/[^a-z]+/g, "");
  return rest.length === 0;
}

export function parseIntent(text: string): RuleIntent {
  const t = text.toLowerCase().trim();
  const buy =
    /\b(buy|purchase|checkout|check out|order (it|this|that|one|the)|i'?ll take|get (it|this|that|the)|add to cart|pay for)\b/.test(t);
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
  if (/^(?:something |anything |show me (?:something )?|any )?(?:cheaper|less expensive|more affordable)\b/.test(t)) {
    return { kind: "cheaper" };
  }
  if (/^(hi|hello|hey|help|what can you do|how does this work)\b/.test(t)) return { kind: "help" };
  return { kind: "search", color: findColor(t), maxPriceCents: findMaxPriceCents(t) };
}
