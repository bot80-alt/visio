import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  isTrustedCertUrl,
  signedMessage,
  verifyPayPalWebhook,
  type WebhookHeaders,
} from "@/lib/webhook-verify";

const WEBHOOK_ID = "8PT597110X687430LKGECATA";
const CERT_URL = "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77";
let keyPem = "";
let certPem = "";

// A throwaway key pair generated per run stands in for PayPal's signing cert.
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "visio-webhook-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-subj", "/CN=messageverificationcerts.sandbox.paypal.com",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
  ], { stdio: "ignore" });
  keyPem = readFileSync(join(dir, "key.pem"), "utf8");
  certPem = readFileSync(join(dir, "cert.pem"), "utf8");
});

function signed(body: string, overrides: Partial<WebhookHeaders> = {}) {
  const raw = new TextEncoder().encode(body);
  const base: WebhookHeaders = {
    transmissionId: "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
    transmissionTime: new Date().toISOString(),
    transmissionSig: "",
    certUrl: CERT_URL,
    authAlgo: "SHA256withRSA",
    ...overrides,
  };
  const signer = createSign("RSA-SHA256");
  signer.update(signedMessage(base, WEBHOOK_ID, raw));
  base.transmissionSig = overrides.transmissionSig ?? signer.sign(keyPem, "base64");
  return { headers: base, raw };
}

const fetchCert = async () => certPem;
const event = JSON.stringify({
  id: "WH-1",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAP-1", supplementary_data: { related_ids: { order_id: "ORDER-1" } } },
});

describe("PayPal webhook verification", () => {
  it("builds the signed message from the CRC32 of the raw body", () => {
    const raw = new TextEncoder().encode(event);
    const { headers } = signed(event);
    expect(signedMessage(headers, WEBHOOK_ID, raw)).toBe(
      `${headers.transmissionId}|${headers.transmissionTime}|${WEBHOOK_ID}|${crc32(raw) >>> 0}`,
    );
  });

  it("accepts a correctly signed event", async () => {
    const { headers, raw } = signed(event);
    expect(await verifyPayPalWebhook({ headers, rawBody: raw, webhookId: WEBHOOK_ID, fetchCert })).toEqual({ ok: true });
  });

  it("rejects a body changed after signing, even by whitespace", async () => {
    const { headers } = signed(event);
    const raw = new TextEncoder().encode(event + " ");
    const res = await verifyPayPalWebhook({ headers, rawBody: raw, webhookId: WEBHOOK_ID, fetchCert });
    expect(res).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects events signed for a different webhook id", async () => {
    const { headers, raw } = signed(event);
    const res = await verifyPayPalWebhook({ headers, rawBody: raw, webhookId: "OTHER", fetchCert });
    expect(res.ok).toBe(false);
  });

  it("refuses certificates hosted outside PayPal", async () => {
    const { headers, raw } = signed(event, { certUrl: "https://evil.example.com/cert.pem" });
    const res = await verifyPayPalWebhook({ headers, rawBody: raw, webhookId: WEBHOOK_ID, fetchCert });
    expect(res).toEqual({ ok: false, reason: "untrusted cert url" });
    expect(isTrustedCertUrl("http://api.sandbox.paypal.com/x")).toBe(false);
    expect(isTrustedCertUrl("https://api.sandbox.paypal.com.evil.io/x")).toBe(false);
    expect(isTrustedCertUrl("https://api.sandbox.paypal.com:8443/x")).toBe(false);
  });

  it("rejects stale transmissions and unknown algorithms", async () => {
    const old = signed(event, { transmissionTime: new Date(Date.now() - 80 * 3600 * 1000).toISOString() });
    expect((await verifyPayPalWebhook({ headers: old.headers, rawBody: old.raw, webhookId: WEBHOOK_ID, fetchCert })).ok).toBe(false);
    const md5 = signed(event, { authAlgo: "MD5withRSA" });
    expect(await verifyPayPalWebhook({ headers: md5.headers, rawBody: md5.raw, webhookId: WEBHOOK_ID, fetchCert })).toEqual({
      ok: false,
      reason: "unsupported auth algo",
    });
  });
});
