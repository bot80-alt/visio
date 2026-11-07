// Text tower: semantic match between the user's description and product copy.
export const TEXT_MODEL_ID = "Xenova/bge-small-en-v1.5";
export const TEXT_DIM = 384;
export const TEXT_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Vision-language tower: the user's words against product photos.
export const CLIP_MODEL_ID = "Xenova/mobileclip_s0";
export const CLIP_DIM = 512;

export const ASR_MODEL_ID = "Xenova/whisper-tiny.en";

export const MODEL_DTYPE = "q8" as const;

export function productDocument(p: {
  title: string;
  brand: string | null;
  category: string;
  tags: string[];
  description: string;
}): string {
  return [p.title, p.brand, p.category.replace(/-/g, " "), p.tags.join(", "), p.description]
    .filter(Boolean)
    .join(". ");
}

export function productCaption(p: { title: string; category: string }): string {
  return `a product photo of ${p.title.toLowerCase()}`;
}
