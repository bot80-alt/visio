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
] as const;

export type Color = (typeof COLORS)[number];

export function conceptKey(object: string, color?: string | null): string {
  return color ? `${color} ${object}` : object;
}

export function conceptPrompt(object: string, color?: string | null): string {
  return `a photo of a ${conceptKey(object, color)}`;
}

export function productPrompt(p: { title: string; object: string }): string {
  return `a photo of ${p.title.toLowerCase()}, a ${p.object}`;
}
