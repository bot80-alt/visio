import { BrainCircuitIcon, ScanEyeIcon, ShieldCheckIcon, WebhookIcon } from "lucide-react";
import { VisioApp } from "@/components/visio-app";

const STEPS = [
  {
    icon: ScanEyeIcon,
    title: "See",
    body: "SigLIP 2 runs in your browser and embeds overlapping square regions of the frame, so wide cinematic shots aren't squashed.",
  },
  {
    icon: BrainCircuitIcon,
    title: "Understand",
    body: "A Groq-hosted LLM turns what you say into tool calls. Descriptions are grounded to SigLIP 2 concept embeddings and fused with visual similarity.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Propose, don't pay",
    body: "The agent can only emit an HMAC-signed proposal with no price. The server re-prices it from the catalog and burns its nonce on use.",
  },
  {
    icon: WebhookIcon,
    title: "Verified",
    body: "Fastlane by PayPal tokenizes the card, Orders v2 captures it, and only a signature-verified PayPal webhook marks the order paid.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-3 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
            V
          </div>
          <div>
            <p className="text-base font-semibold leading-none">Visio</p>
            <p className="mt-1 text-xs text-muted-foreground">See it in the scene. Own it in one tap.</p>
          </div>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
          PayPal Sandbox · no real money
        </span>
      </header>

      <VisioApp />

      <section className="mx-auto w-full max-w-[1400px] px-3 pb-10 sm:px-6">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">How Visio keeps an AI away from your wallet</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border border-white/10 bg-card/50 p-4">
              <s.icon className="mb-2 size-5 text-sky-300" />
              <p className="text-sm font-medium">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Sample catalog from DummyJSON. Scenes are AI-generated. Built for the PayPal AI Hackathon 2026.
        </p>
      </section>
    </main>
  );
}
