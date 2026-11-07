import { describe, expect, it } from "vitest";
import { focusPhrase } from "@/lib/focus";
import { findColor, findMaxPriceCents, isRefinement, parseIntent } from "@/lib/intent";

describe("parseIntent", () => {
  it("reads purchase verbs, ordinals and quantities", () => {
    expect(parseIntent("buy #2")).toEqual({ kind: "buy", index: 1, quantity: 1 });
    expect(parseIntent("I'll take the third one")).toEqual({ kind: "buy", index: 2, quantity: 1 });
    expect(parseIntent("checkout 3 of the last")).toEqual({ kind: "buy", index: -1, quantity: 3 });
    expect(parseIntent("buy 9x")).toMatchObject({ quantity: 5 });
  });

  it("does not treat descriptions as purchases", () => {
    expect(parseIntent("the order of the phoenix scarf").kind).toBe("search");
    expect(parseIntent("a red dress under $80")).toEqual({ kind: "search", color: "red", maxPriceCents: 8000 });
  });

  it("recognizes cheaper and help", () => {
    expect(parseIntent("cheaper").kind).toBe("cheaper");
    expect(parseIntent("something more affordable").kind).toBe("cheaper");
    expect(parseIntent("help").kind).toBe("help");
  });
});

describe("attribute parsing", () => {
  it("maps color synonyms", () => {
    expect(findColor("a crimson silk scarf")).toBe("red");
    expect(findColor("gray hoodie")).toBe("grey");
    expect(findColor("a wooden table")).toBeNull();
  });

  it("parses budgets", () => {
    expect(findMaxPriceCents("under $1,200")).toBe(120000);
    expect(findMaxPriceCents("below 2k")).toBe(200000);
    expect(findMaxPriceCents("no budget")).toBeNull();
  });
});

describe("isRefinement", () => {
  it("accepts short modifiers of the previous description", () => {
    for (const t of ["in black", "but cheaper", "with a leather strap", "under $50", "gold", "black one please", "a different color"]) {
      expect(isRefinement(t), t).toBe(true);
    }
  });

  it("rejects new descriptions", () => {
    for (const t of ["red lipstick", "blue denim jacket", "the scooter he rides through the neon alley at night in the rain"]) {
      expect(isRefinement(t), t).toBe(false);
    }
  });
});

describe("focusPhrase", () => {
  it.each([
    ["the matte silver over-ear headphones the android wears while staring out the rainy window", "the matte silver over-ear headphones"],
    ["the scooter he rides through the neon alley", "the scooter"],
    ["Green crystal drop earrings catching the candlelight at dinner", "Green crystal drop earrings"],
    ["A long black evening gown with a slit, the one she wears down the staircase", "A long black evening gown with a slit"],
    ["show me a diver's watch with a black bezel like the spy wears", "a diver's watch with a black bezel"],
    ["the warm glowing table lamp on the nightstand", "the warm glowing table lamp"],
  ])("%s", (input, expected) => {
    expect(focusPhrase(input)).toBe(expected);
  });

  it("never reduces a description to a single word", () => {
    expect(focusPhrase("sunglasses he wears")).toBe("sunglasses he wears");
    expect(focusPhrase("red lipstick")).toBe("red lipstick");
  });
});
