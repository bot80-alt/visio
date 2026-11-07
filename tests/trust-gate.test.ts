import { describe, expect, it } from "vitest";
import { PROPOSAL_TTL_MS, ProposalError, signProposal, verifyProposal } from "@/lib/trust-gate";

const SECRET = "a".repeat(64);

function code(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof ProposalError ? e.code : "other";
  }
  return "ok";
}

describe("trust gate proposals", () => {
  it("round-trips a signed proposal without any price in it", () => {
    const { token, payload } = signProposal({ productId: "p47", quantity: 2 }, SECRET);
    expect(verifyProposal(token, SECRET)).toEqual(payload);
    expect(JSON.stringify(payload)).not.toMatch(/price|amount/i);
  });

  it("rejects a proposal signed with another key", () => {
    const { token } = signProposal({ productId: "p47", quantity: 1 }, SECRET);
    expect(code(() => verifyProposal(token, "b".repeat(64)))).toBe("bad_signature");
  });

  it("rejects a payload edited after signing", () => {
    const { token } = signProposal({ productId: "p47", quantity: 1 }, SECRET);
    const [body, sig] = token.split(".");
    const edited = JSON.parse(Buffer.from(body, "base64url").toString());
    edited.qty = 5;
    const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${sig}`;
    expect(code(() => verifyProposal(forged, SECRET))).toBe("bad_signature");
  });

  it("expires proposals after the TTL", () => {
    const t0 = 1_700_000_000_000;
    const { token } = signProposal({ productId: "p47", quantity: 1 }, SECRET, t0);
    expect(code(() => verifyProposal(token, SECRET, t0 + PROPOSAL_TTL_MS - 1))).toBe("ok");
    expect(code(() => verifyProposal(token, SECRET, t0 + PROPOSAL_TTL_MS + 1))).toBe("expired");
  });

  it("refuses out-of-range quantities and malformed tokens", () => {
    expect(code(() => signProposal({ productId: "p47", quantity: 6 }, SECRET))).toBe("invalid");
    expect(code(() => signProposal({ productId: "p47", quantity: 0 }, SECRET))).toBe("invalid");
    expect(code(() => verifyProposal("not-a-token", SECRET))).toBe("malformed");
    expect(code(() => verifyProposal("a.b.c", SECRET))).toBe("malformed");
  });

  it("gives every proposal a fresh single-use nonce", () => {
    const a = signProposal({ productId: "p47", quantity: 1 }, SECRET).payload.n;
    const b = signProposal({ productId: "p47", quantity: 1 }, SECRET).payload.n;
    expect(a).not.toBe(b);
  });
});
