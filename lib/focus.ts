// Cinematic descriptions mix the product with story context ("...the courier
// wears in the chase scene"). The focus phrase keeps the product description so
// both encoders see the object, while the full sentence is still embedded too.
const CONTEXT_MARKERS = [
  /\s+(?:that|which|who|while|when|where)\s+/i,
  /\s+(?:in|on|at|from|inside|during)\s+(?:the|a|an|his|her|their|that|this)\s+(?=(?:[\w'-]+(?:'s)?\s+)?(?:scene|shot|film|movie|frame|room|penthouse|apartment|office|street|kitchen|bedroom|bar|club|car|wrist|neck|desk|table|nightstand|vanity|window|wall|shelf|counter|floor|bed|hand|hands|face|head|feet)\b)/i,
  /\s+(?:just\s+)?(?:like|similar to)\s+(?:the|a|an|his|her|their|what)\b/i,
  /\s+(?:the|a|an|his|her|their|that|this)\s+[\w'-]+(?:\s+[\w'-]+)?\s+(?:never\s+|always\s+|keeps\s+|is\s+|was\s+)?(?:wears|wore|wearing|holds|held|holding|carries|carried|carrying|uses|used|using|drives|drove|driving|rides|rode|riding|has|had|tosses|tossed|types|typing|takes|took|grabs|grabbed|puts|put|picks|picked|laces|laced|drinks|drank|reads|plays|played|keeps|kept|buys|bought|sits|sat|sleeps|slept)\b/i,
  /\s+(?:he|she|they|i|we|you)\s+(?:never\s+|always\s+|just\s+)?[a-z]+(?:s|ed)?\b/i,
  /\s+[a-z]+ing\s+(?:the|a|an|his|her|their|on|in|at|through|over|under|out)\b/i,
  /\s+(?:worn|held|carried|used|seen)\s+(?:by|in)\b/i,
  /,?\s+the one\b/i,
];

const FILLER = /^(?:i(?:'m| am)? (?:looking for|want|need)|find me|show me|get me|looking for|i'd like|can you find)\s+/i;

export function focusPhrase(text: string): string {
  let t = text.trim().replace(FILLER, "");
  for (const marker of CONTEXT_MARKERS) {
    const m = t.match(marker);
    if (m && m.index !== undefined) {
      const head = t.slice(0, m.index).trim();
      if (head.split(/\s+/).length >= 2) t = head;
    }
  }
  return t.replace(/[.,;:!?]+$/, "");
}
