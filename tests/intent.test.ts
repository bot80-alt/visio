import { describe, expect, it } from "vitest";
import { findColor, findMaxPriceCents, findObject, parseIntent } from "@/lib/intent";

const KNOWN = ["headphones", "wireless earbuds", "table lamp", "sneakers", "sunglasses", "drinking glass", "wristwatch", "smartwatch", "corset dress", "dress"];

describe("intent parsing", () => {
  it("maps everyday words to catalog objects", () => {
    expect(findObject("the silver cans she's wearing", KNOWN)).toBe("headphones");
    expect(findObject("that brass lamp in the back", KNOWN)).toBe("table lamp");
    expect(findObject("his kicks", KNOWN)).toBe("sneakers");
    expect(findObject("apple watch on the desk", KNOWN)).toBe("smartwatch");
    expect(findObject("a corset dress", KNOWN)).toBe("corset dress");
  });

  it("extracts colors and budgets", () => {
    expect(findColor("matte black over-ears")).toBe("black");
    expect(findColor("a gray hoodie")).toBe("grey");
    expect(findMaxPriceCents("under $150")).toBe(15000);
    expect(findMaxPriceCents("less than 1.2k")).toBe(120000);
    expect(findMaxPriceCents("nice ones")).toBeNull();
  });

  it("recognises purchase requests with ordinals and quantities", () => {
    expect(parseIntent("buy #2", KNOWN)).toEqual({ kind: "buy", index: 1, quantity: 1 });
    expect(parseIntent("I'll take the third one", KNOWN)).toEqual({ kind: "buy", index: 2, quantity: 1 });
    expect(parseIntent("buy 2 of the first", KNOWN)).toEqual({ kind: "buy", index: 0, quantity: 2 });
    expect(parseIntent("in order to compare, show sneakers", KNOWN).kind).toBe("search");
  });

  it("distinguishes refinement from new searches", () => {
    expect(parseIntent("something cheaper", KNOWN)).toEqual({ kind: "cheaper" });
    expect(parseIntent("black sunglasses under $50", KNOWN)).toEqual({
      kind: "search",
      object: "sunglasses",
      color: "black",
      maxPriceCents: 5000,
    });
  });
});
