"use client";

import type { CheckoutMode } from "./types";

export type CheckoutConfig =
  | { mode: "demo"; reason?: string }
  | { mode: "sandbox"; clientId: string; clientToken: string };

export type FastlaneAddress = {
  addressLine1: string;
  addressLine2?: string;
  adminArea1: string;
  adminArea2: string;
  postalCode: string;
  countryCode: string;
};

export type FastlaneProfile = {
  name?: { fullName?: string; firstName?: string; lastName?: string };
  shippingAddress?: { name?: { fullName?: string }; address: FastlaneAddress };
  card?: { id: string; paymentSource?: { card?: { brand?: string; lastDigits?: string } } };
};

type Renderable = { render: (selector: string | HTMLElement) => Promise<void> | void };

export type FastlaneCardComponent = Renderable & {
  getPaymentToken: (opts: { billingAddress?: FastlaneAddress; name?: { fullName: string } }) => Promise<{ id: string }>;
};

export type Fastlane = {
  setLocale?: (locale: string) => void;
  identity: {
    lookupCustomerByEmail: (email: string) => Promise<{ customerContextId?: string }>;
    triggerAuthenticationFlow: (
      customerContextId: string,
    ) => Promise<{ authenticationState: string; profileData?: FastlaneProfile }>;
  };
  FastlaneCardComponent: (opts?: Record<string, unknown>) => Promise<FastlaneCardComponent>;
  FastlaneWatermarkComponent: (opts?: Record<string, unknown>) => Promise<Renderable>;
};

declare global {
  interface Window {
    paypal?: { Fastlane?: (opts?: Record<string, unknown>) => Promise<Fastlane> };
  }
}

let configPromise: Promise<CheckoutConfig> | null = null;
let fastlanePromise: Promise<Fastlane> | null = null;

export function checkoutConfig(): Promise<CheckoutConfig> {
  configPromise ??= fetch("/api/checkout/config", { cache: "no-store" })
    .then((r) => r.json() as Promise<CheckoutConfig>)
    .catch(() => {
      configPromise = null;
      return { mode: "demo", reason: "Could not reach the checkout service" } as CheckoutConfig;
    });
  return configPromise;
}

export function loadFastlane(cfg: Extract<CheckoutConfig, { mode: "sandbox" }>): Promise<Fastlane> {
  fastlanePromise ??= new Promise<Fastlane>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&components=fastlane`;
    script.async = true;
    script.setAttribute("data-sdk-client-token", cfg.clientToken);
    script.onload = async () => {
      try {
        if (!window.paypal?.Fastlane) throw new Error("Fastlane is not available for this account");
        const fastlane = await window.paypal.Fastlane({});
        fastlane.setLocale?.("en_us");
        resolve(fastlane);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error("Could not load the PayPal SDK"));
    document.head.appendChild(script);
  }).catch((error) => {
    fastlanePromise = null;
    throw error;
  });
  return fastlanePromise;
}

export type { CheckoutMode };
