import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// A TransactionProposal is the only thing the agent can produce. It names what
// to buy, never a price, and carries no payment authority: the server re-prices
// it from the catalog, and only a user gesture plus a verified PayPal webhook
// turns it into a paid order.
export type ProposalPayload = {
  v: 1;
  pid: string;
  qty: number;
  n: string;
  exp: number;
};

export const PROPOSAL_TTL_MS = 15 * 60 * 1000;
export const MAX_QUANTITY = 5;

export class ProposalError extends Error {
  constructor(
    message: string,
    readonly code: "malformed" | "bad_signature" | "expired" | "invalid",
  ) {
    super(message);
  }
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`visio.proposal.v1.${body}`).digest("base64url");
}

export function signProposal(
  input: { productId: string; quantity: number },
  secret: string,
  now = Date.now(),
): { token: string; payload: ProposalPayload } {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY) {
    throw new ProposalError("quantity out of range", "invalid");
  }
  const payload: ProposalPayload = {
    v: 1,
    pid: input.productId,
    qty: input.quantity,
    n: randomBytes(16).toString("hex"),
    exp: now + PROPOSAL_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body, secret)}`, payload };
}

export function verifyProposal(token: string, secret: string, now = Date.now()): ProposalPayload {
  if (typeof token !== "string" || token.length > 1024) throw new ProposalError("malformed", "malformed");
  const parts = token.split(".");
  if (parts.length !== 2) throw new ProposalError("malformed", "malformed");
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new ProposalError("signature mismatch", "bad_signature");
  }
  let payload: ProposalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new ProposalError("malformed", "malformed");
  }
  if (
    payload.v !== 1 ||
    typeof payload.pid !== "string" ||
    !Number.isInteger(payload.qty) ||
    payload.qty < 1 ||
    payload.qty > MAX_QUANTITY ||
    typeof payload.n !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new ProposalError("invalid payload", "invalid");
  }
  if (payload.exp < now) throw new ProposalError("proposal expired", "expired");
  return payload;
}
