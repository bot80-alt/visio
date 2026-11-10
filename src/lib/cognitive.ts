export type ToolBadge = "Ps" | "Lr" | "Figma" | "Ai";

export type AssetType =
  | "transparent-png"
  | "background-plate"
  | "font"
  | "reference";

export type AssetLicense = "organic" | "premium";

export interface CognitiveAsset {
  id: string;
  title: string;
  type: AssetType;
  url: string;
  tags: string[];
  tools: ToolBadge[];
  source: string;
  license: AssetLicense;
}

export interface UnderstandingStep {
  step: string;
  detail: string;
}

export interface StrategyStep {
  step: number;
  tool: string;
  instruction: string;
}

export interface AcpAgentStatus {
  provider: "PayPal ACP";
  message: string;
  premium_count: number;
  standing_by: boolean;
}

export interface CognitiveSearchResponse {
  query: string;
  decomposition: {
    literal_entities: string[];
    subtext_vibe: string[];
    required_assets: string[];
  };
  understanding_log: UnderstandingStep[];
  assets: CognitiveAsset[];
  strategy_guide: StrategyStep[];
  acp_agent_status: AcpAgentStatus;
}

const GTA_SPARK =
  /\b(brad|pitt|dicaprio|de\s*caprio|caprio|jennifer|lawerance|lawrence|gta)\b/i;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "and",
  "as",
  "for",
  "with",
  "on",
  "in",
  "i",
  "wanna",
  "want",
  "create",
  "make",
  "into",
  "from",
  "that",
  "this",
  "my",
]);

const VIBE_WORDS = [
  "ironic",
  "irony",
  "cinematic",
  "neon",
  "dark",
  "meme",
  "funny",
  "moody",
  "nostalgic",
  "gritty",
  "dreamy",
];

function placeholder(seed: string, width: number, height: number) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

function acpStatus(assets: CognitiveAsset[]): AcpAgentStatus {
  const premiumCount = assets.filter((asset) => asset.license === "premium").length;

  if (premiumCount === 0) {
    return {
      provider: "PayPal ACP",
      message: "No premium licenses required. ACP Agent is idle.",
      premium_count: 0,
      standing_by: false,
    };
  }

  return {
    provider: "PayPal ACP",
    message: `${premiumCount} premium assets require licensing. ACP Agent standing by to negotiate and procure.`,
    premium_count: premiumCount,
    standing_by: true,
  };
}

const gtaAssets: CognitiveAsset[] = [
  {
    id: "pitt-cutout",
    title: "Brad Pitt isolated cutout",
    type: "transparent-png",
    url: placeholder("pitt-cutout", 800, 1100),
    tags: ["portrait", "cutout", "subject", "public-figure"],
    tools: ["Ps", "Figma"],
    source: "Licensed stills archive",
    license: "premium",
  },
  {
    id: "dicaprio-cutout",
    title: "Leonardo DiCaprio isolated cutout",
    type: "transparent-png",
    url: placeholder("dicaprio-cutout", 800, 1100),
    tags: ["portrait", "cutout", "subject", "public-figure"],
    tools: ["Ps", "Figma"],
    source: "Licensed stills archive",
    license: "premium",
  },
  {
    id: "lawrence-cutout",
    title: "Jennifer Lawrence isolated cutout",
    type: "transparent-png",
    url: placeholder("lawrence-cutout", 800, 1100),
    tags: ["portrait", "cutout", "subject", "public-figure"],
    tools: ["Ps", "Figma"],
    source: "Licensed stills archive",
    license: "premium",
  },
  {
    id: "neon-plate",
    title: "Vice City neon night plate",
    type: "background-plate",
    url: placeholder("vice-city-neon", 1400, 900),
    tags: ["neon", "night", "magenta", "city"],
    tools: ["Ps", "Lr"],
    source: "Organic stock",
    license: "organic",
  },
  {
    id: "asphalt-plate",
    title: "Wet asphalt rim-light plate",
    type: "background-plate",
    url: placeholder("wet-asphalt", 1400, 900),
    tags: ["asphalt", "rim-light", "night", "reflection"],
    tools: ["Ps", "Lr"],
    source: "Organic stock",
    license: "organic",
  },
  {
    id: "display-font",
    title: "Condensed display face, GTA-like",
    type: "font",
    url: placeholder("display-font", 1200, 400),
    tags: ["display", "condensed", "title", "lookalike"],
    tools: ["Ps", "Figma", "Ai"],
    source: "Open font library",
    license: "organic",
  },
  {
    id: "poster-frame",
    title: "Vertical loading-screen frame",
    type: "reference",
    url: placeholder("poster-frame", 900, 1350),
    tags: ["poster", "pin", "2:3", "frame"],
    tools: ["Ps", "Figma"],
    source: "Composition reference",
    license: "organic",
  },
];

function gtaFixture(query: string): CognitiveSearchResponse {
  return {
    query,
    decomposition: {
      literal_entities: [
        "Brad Pitt",
        "Leonardo DiCaprio",
        "Jennifer Lawrence",
        "GTA 6 poster",
        "pin format",
      ],
      subtext_vibe: [
        "cinematic crime-satire",
        "Vice City neon",
        "ironic celebrity-as-loading-screen",
        "colloquial pin",
      ],
      required_assets: [
        "Transparent PNG cutouts",
        "Neon background plates",
        "Condensed display font",
        "Vertical poster frame",
      ],
    },
    understanding_log: [
      {
        step: "Literal read",
        detail:
          "Three named people, arranged as Grand Theft Auto VI posters, delivered as a pin.",
      },
      {
        step: "Colloquial pin",
        detail:
          "Pin means a tall Pinterest-style poster, about 2:3, not a map marker.",
      },
      {
        step: "Name repair",
        detail:
          "de caprio resolves to Leonardo DiCaprio. lawerance resolves to Jennifer Lawrence.",
      },
      {
        step: "Subtext",
        detail:
          "GTA 6 here is a Vice City neon crime-satire, with the celebrities treated like ironic loading-screen characters.",
      },
      {
        step: "Guardrail",
        detail:
          "Public figures are not generated. The engine returns cutouts, plates, and type so the composite happens in an editor.",
      },
    ],
    assets: gtaAssets,
    strategy_guide: [
      {
        step: 1,
        tool: "Photoshop",
        instruction:
          "Select Subject on each cutout, refine the edge, and keep every person on a separate layer.",
      },
      {
        step: 2,
        tool: "Photoshop",
        instruction:
          "Grade the night plate with a magenta and cyan Overlay, then a Soft Light pass so the skin picks up the neon without clipping.",
      },
      {
        step: 3,
        tool: "Photoshop",
        instruction:
          "Set the title in the condensed display face, tight tracking, high on the frame. Treat it as a lookalike lockup, not the official wordmark.",
      },
      {
        step: 4,
        tool: "Export",
        instruction:
          "Crop to a 2:3 pin, sRGB, and export a PNG. Keep the cutout layers if a later pass needs a different plate.",
      },
    ],
    acp_agent_status: acpStatus(gtaAssets),
  };
}

function tokens(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function thinFixture(query: string): CognitiveSearchResponse {
  const words = tokens(query);
  const entities = words.slice(0, 6);
  const vibe = VIBE_WORDS.filter((word) => words.includes(word));
  const assets: CognitiveAsset[] = [
    {
      id: "reference-still",
      title: "Reference still",
      type: "reference",
      url: placeholder("reference-still", 1200, 800),
      tags: entities.slice(0, 3),
      tools: ["Ps", "Figma"],
      source: "Organic stock",
      license: "organic",
    },
    {
      id: "cutout-plate",
      title: "Neutral cutout plate",
      type: "transparent-png",
      url: placeholder("cutout-plate", 800, 1000),
      tags: ["cutout", "subject"],
      tools: ["Ps"],
      source: "Organic stock",
      license: "organic",
    },
  ];

  return {
    query,
    decomposition: {
      literal_entities: entities.length > 0 ? entities : [query],
      subtext_vibe: vibe.length > 0 ? vibe : ["unspecified mood"],
      required_assets: ["Reference stills", "Transparent cutouts"],
    },
    understanding_log: [
      {
        step: "Literal read",
        detail: `The spark names ${entities.length > 0 ? entities.join(", ") : "no distinct objects"}, without a known scenario fixture.`,
      },
      {
        step: "Thin match",
        detail:
          "No affective scenario matched, so the engine returns a same-shape placeholder set instead of the GTA poster kit.",
      },
    ],
    assets,
    strategy_guide: [
      {
        step: 1,
        tool: "Photoshop",
        instruction:
          "Isolate the subject from the cutout plate and place it over the reference still.",
      },
      {
        step: 2,
        tool: "Lightroom",
        instruction:
          "Match white balance between the plate and the subject before exporting.",
      },
    ],
    acp_agent_status: acpStatus(assets),
  };
}

export function searchCognitive(query: string): CognitiveSearchResponse {
  if (GTA_SPARK.test(query)) {
    return gtaFixture(query);
  }

  return thinFixture(query);
}
