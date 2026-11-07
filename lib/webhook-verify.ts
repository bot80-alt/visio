import { createVerify, X509Certificate } from "node:crypto";
import { crc32 } from "node:zlib";

export type WebhookHeaders = {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export const MAX_WEBHOOK_AGE_MS = 72 * 60 * 60 * 1000;

export function readWebhookHeaders(h: Headers): WebhookHeaders | null {
  const get = (k: string) => h.get(k)?.trim() ?? "";
  const out = {
    transmissionId: get("paypal-transmission-id"),
    transmissionTime: get("paypal-transmission-time"),
    transmissionSig: get("paypal-transmission-sig"),
    certUrl: get("paypal-cert-url"),
    authAlgo: get("paypal-auth-algo"),
  };
  return Object.values(out).every(Boolean) ? out : null;
}

// Only PayPal-hosted certificates are fetched, which also keeps the cert URL
// header from being used to make this server request arbitrary hosts.
export function isTrustedCertUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      (url.hostname === "api.paypal.com" ||
        url.hostname === "api.sandbox.paypal.com" ||
        url.hostname === "api-m.paypal.com" ||
        url.hostname === "api-m.sandbox.paypal.com")
    );
  } catch {
    return false;
  }
}

// PayPal signs `<transmissionId>|<transmissionTime>|<webhookId>|<crc32(rawBody)>`
// with SHA256withRSA. The CRC must be computed over the exact bytes received.
export function signedMessage(h: WebhookHeaders, webhookId: string, rawBody: Uint8Array): string {
  return `${h.transmissionId}|${h.transmissionTime}|${webhookId}|${crc32(rawBody) >>> 0}`;
}

export async function verifyPayPalWebhook(opts: {
  headers: WebhookHeaders;
  rawBody: Uint8Array;
  webhookId: string;
  fetchCert: (url: string) => Promise<string>;
  now?: number;
}): Promise<VerifyResult> {
  const { headers, rawBody, webhookId, fetchCert } = opts;
  const now = opts.now ?? Date.now();
  if (headers.authAlgo !== "SHA256withRSA") return { ok: false, reason: "unsupported auth algo" };
  if (!isTrustedCertUrl(headers.certUrl)) return { ok: false, reason: "untrusted cert url" };
  const sent = Date.parse(headers.transmissionTime);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > MAX_WEBHOOK_AGE_MS) {
    return { ok: false, reason: "stale or invalid transmission time" };
  }

  let pem: string;
  try {
    pem = await fetchCert(headers.certUrl);
  } catch {
    return { ok: false, reason: "cert fetch failed" };
  }
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(pem);
  } catch {
    return { ok: false, reason: "invalid cert" };
  }
  const validFrom = Date.parse(cert.validFrom);
  const validTo = Date.parse(cert.validTo);
  if (now < validFrom || now > validTo) return { ok: false, reason: "cert expired" };

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signedMessage(headers, webhookId, rawBody));
  verifier.end();
  const ok = verifier.verify(cert.publicKey, Buffer.from(headers.transmissionSig, "base64"));
  return ok ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

const certCache = new Map<string, { pem: string; at: number }>();

export async function fetchPayPalCert(url: string): Promise<string> {
  const hit = certCache.get(url);
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit.pem;
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`cert fetch ${res.status}`);
  const pem = await res.text();
  if (pem.length > 20000) throw new Error("cert too large");
  certCache.set(url, { pem, at: Date.now() });
  return pem;
}
