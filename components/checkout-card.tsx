"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, LockIcon, ShieldCheckIcon, XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import {
  checkoutConfig,
  loadFastlane,
  type CheckoutConfig,
  type Fastlane,
  type FastlaneAddress,
  type FastlaneCardComponent,
  type FastlaneProfile,
} from "@/lib/paypal-sdk";
import type { Card, OrderView } from "@/lib/types";

type CheckoutCardData = Extract<Card, { type: "checkout" }>;

type Step =
  | "summary"
  | "email"
  | "member"
  | "guest"
  | "submitting"
  | "tracking"
  | "error";

const SAMPLE_ADDRESS = {
  addressLine1: "2211 N First St",
  city: "San Jose",
  state: "CA",
  postalCode: "95131",
  countryCode: "US",
};

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function CheckoutCard({ card }: { card: CheckoutCardData }) {
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [step, setStep] = useState<Step>("summary");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState(SAMPLE_ADDRESS);
  const [profile, setProfile] = useState<FastlaneProfile | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fastlane = useRef<Fastlane | null>(null);
  const cardComponent = useRef<FastlaneCardComponent | null>(null);
  const cardSlot = useRef<HTMLDivElement>(null);
  const watermarkSlot = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  const expired = now > card.expiresAt && step !== "tracking";

  useEffect(() => {
    checkoutConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    let tries = 0;
    async function poll() {
      if (stop) return;
      tries++;
      const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const view = (await res.json()) as OrderView;
        setOrder(view);
        if (["paid", "denied", "failed", "demo_paid"].includes(view.status)) return;
      }
      if (tries < 45) setTimeout(poll, 2000);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (step !== "email" || !fastlane.current || !watermarkSlot.current) return;
    fastlane.current
      .FastlaneWatermarkComponent({ includeAdditionalInfo: true })
      .then((w) => w.render(watermarkSlot.current!))
      .catch(() => {});
  }, [step]);

  useEffect(() => {
    if (step !== "guest" || !fastlane.current || !cardSlot.current || cardComponent.current) return;
    fastlane.current
      .FastlaneCardComponent({})
      .then((c) => {
        cardComponent.current = c;
        return c.render(cardSlot.current!);
      })
      .catch(() => setError("Fastlane card fields could not load."));
  }, [step]);

  async function submitOrder(body: Record<string, unknown>) {
    setStep("submitting");
    setError(null);
    const res = await fetch("/api/checkout/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: card.proposal, ...body }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error ?? "Checkout failed. Please try again.");
      setStep("error");
      return;
    }
    setOrderId(data.orderId);
    setStep("tracking");
  }

  async function start() {
    setError(null);
    if (!config || config.mode === "demo") {
      await submitOrder({ mode: "demo" });
      return;
    }
    setBusy(true);
    try {
      fastlane.current = await loadFastlane(config);
      setStep("email");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fastlane could not start.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!fastlane.current) return;
    setBusy(true);
    setError(null);
    try {
      const { customerContextId } = await fastlane.current.identity.lookupCustomerByEmail(email.trim());
      if (customerContextId) {
        const auth = await fastlane.current.identity.triggerAuthenticationFlow(customerContextId);
        if (auth.authenticationState === "succeeded" && auth.profileData?.card) {
          setProfile(auth.profileData);
          setStep("member");
          return;
        }
      }
      setStep("guest");
    } catch {
      setError("Fastlane lookup failed. You can continue as a guest.");
      setStep("guest");
    } finally {
      setBusy(false);
    }
  }

  function shippingFrom(a: FastlaneAddress, name: string) {
    return {
      fullName: name,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2 || undefined,
      city: a.adminArea2,
      state: a.adminArea1,
      postalCode: a.postalCode,
      countryCode: a.countryCode,
    };
  }

  async function payAsMember() {
    if (!profile?.card || !profile.shippingAddress) return;
    const name = profile.shippingAddress.name?.fullName || profile.name?.fullName || "Fastlane member";
    await submitOrder({
      mode: "sandbox",
      paymentToken: profile.card.id,
      shipping: shippingFrom(profile.shippingAddress.address, name),
    });
  }

  async function payAsGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!cardComponent.current) return;
    const billing: FastlaneAddress = {
      addressLine1: address.addressLine1,
      adminArea1: address.state,
      adminArea2: address.city,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
    };
    setBusy(true);
    try {
      const { id } = await cardComponent.current.getPaymentToken({ billingAddress: billing });
      await submitOrder({ mode: "sandbox", paymentToken: id, shipping: shippingFrom(billing, fullName.trim()) });
    } catch {
      setError("Check the card details and try again.");
    } finally {
      setBusy(false);
    }
  }

  const demo = config?.mode === "demo";
  const total = formatMoney(card.totalCents, card.product.currency);
  const minutesLeft = Math.max(0, Math.ceil((card.expiresAt - now) / 60000));

  return (
    <div className="overflow-hidden rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-400/10 to-card">
      <div className="flex items-center gap-3 p-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-white">
          <Image src={card.product.image} alt={card.product.title} fill sizes="56px" className="object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.product.title}</p>
          <p className="text-xs text-muted-foreground">
            Qty {card.quantity} · priced by the catalog, not the AI
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold">{total}</p>
          <p className="text-[11px] text-muted-foreground">Free shipping</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 py-2">
        <Badge variant="outline" className="gap-1 border-emerald-400/40 text-emerald-300">
          <ShieldCheckIcon /> Trust Gate signed
        </Badge>
        {demo ? (
          <Badge variant="outline" className="border-amber-300/40 text-amber-200">
            Demo checkout · no PayPal call
          </Badge>
        ) : (
          <Badge variant="outline" className="border-sky-400/40 text-sky-300">
            PayPal Sandbox · Fastlane
          </Badge>
        )}
        {step !== "tracking" && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {expired ? "Expired" : `Expires in ${minutesLeft} min`}
          </span>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        {expired ? (
          <p className="text-sm text-muted-foreground">This proposal expired. Ask Visio to buy it again for a fresh one.</p>
        ) : step === "summary" ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" disabled={!config || busy} onClick={start}>
              {busy || !config ? <Loader2Icon className="animate-spin" /> : <LockIcon />}
              {demo ? `Pay ${total} (demo)` : `Check out with Fastlane · ${total}`}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {demo
                ? "PayPal Sandbox keys aren't configured on this deployment, so this runs the same Trust Gate checks without calling PayPal."
                : "Use a PayPal Sandbox test card. Nothing real is charged."}
            </p>
          </div>
        ) : step === "email" ? (
          <form onSubmit={lookup} className="flex flex-col gap-2">
            <Label htmlFor={`email-${card.proposal.slice(-8)}`}>Email for Fastlane</Label>
            <div className="flex gap-2">
              <Input
                id={`email-${card.proposal.slice(-8)}`}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : "Continue"}
              </Button>
            </div>
            <div ref={watermarkSlot} className="min-h-6" />
          </form>
        ) : step === "member" && profile ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Welcome back{profile.name?.firstName ? `, ${profile.name.firstName}` : ""}. Paying with{" "}
              <span className="font-medium">
                {profile.card?.paymentSource?.card?.brand ?? "card"} •••• {profile.card?.paymentSource?.card?.lastDigits}
              </span>
              , shipping to {profile.shippingAddress?.address.adminArea2}.
            </p>
            <Button size="lg" className="w-full" onClick={payAsMember}>
              <LockIcon /> Pay {total}
            </Button>
          </div>
        ) : step === "guest" ? (
          <form onSubmit={payAsGuest} className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="ship-name">Full name</Label>
                <Input id="ship-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="ship-line1">Shipping address</Label>
                <Input id="ship-line1" required value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} />
              </div>
              <Input aria-label="City" required value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              <div className="flex gap-2">
                <Input aria-label="State" required value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
                <Input aria-label="ZIP" required value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
              </div>
            </div>
            <div ref={cardSlot} className="min-h-24 rounded-md bg-white p-1" />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <LockIcon />} Pay {total}
            </Button>
          </form>
        ) : step === "submitting" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Verifying the proposal and creating the order…
          </p>
        ) : step === "tracking" ? (
          <OrderTimeline order={order} demo={demo} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm text-red-300">
              <XCircleIcon className="size-4" /> {error}
            </p>
            {!demo && (
              <Button variant="outline" size="sm" onClick={() => submitOrder({ mode: "demo" })}>
                Use the demo checkout instead
              </Button>
            )}
          </div>
        )}
        {error && step !== "error" && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}

function Stage({ done, active, label, detail }: { done: boolean; active?: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      ) : active ? (
        <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-sky-300" />
      ) : (
        <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div>
        <p className={done ? "text-sm" : "text-sm text-muted-foreground"}>{label}</p>
        {detail && <p className="text-[11px] text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function OrderTimeline({ order, demo }: { order: OrderView | null; demo: boolean }) {
  const status = order?.status;
  if (status === "denied" || status === "failed") {
    return (
      <p className="flex items-center gap-2 text-sm text-red-300">
        <XCircleIcon className="size-4" /> {status === "denied" ? "PayPal declined the payment." : "The payment didn't go through."}
      </p>
    );
  }
  if (demo || order?.mode === "demo") {
    return (
      <ol className="flex flex-col gap-1.5">
        <Stage done label="Proposal signature, expiry and nonce verified" />
        <Stage done label="Amount recomputed from the catalog" />
        <Stage done={status === "demo_paid"} active={!status} label="Demo order recorded" detail="Add PayPal Sandbox keys to run Fastlane + webhooks for real." />
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5">
      <Stage done label="Proposal signature, expiry and nonce verified" />
      <Stage done label="Fastlane payment token issued" />
      <Stage done={!!order?.paypalOrderId} active={!order} label="Order captured via Orders v2" detail={order?.paypalOrderId ? `PayPal order ${order.paypalOrderId}` : undefined} />
      <Stage
        done={status === "paid" && order?.webhookVerified === true}
        active={status === "awaiting_webhook"}
        label="Signed PayPal webhook verified"
        detail={order?.lastEventType ?? "Waiting for PAYMENT.CAPTURE.COMPLETED…"}
      />
    </ol>
  );
}
