export const THEMES = ["cyber", "lofi"] as const;

export type ThemeId = (typeof THEMES)[number];

export const STYLE_PREFIX: Record<ThemeId, string> = {
  cyber:
    "High-resolution detailed pixel art. Cyberpunk neon-on-dark vibe-coding WORKSPACE (not a dungeon): late-night neon dev floor / server room / terminal stations. Palette anchors #0b0a12, #36c5e0, #a06cd5.",
  lofi: "High-resolution detailed pixel art. Cozy lo-fi vibe-coding WORKSPACE (not a dungeon): cozy dev loft with warm lamp, plants, coffee, soft practical desk details. Palette anchors #f2c84b, #5fd35f.",
};

export const AVOID =
  "avoid: dungeon, medieval, fantasy weapons, castles, torches, stone dungeon walls, low-resolution output, blurry pixels, smudged details, jpeg artifacts, muddy silhouettes.";

export type Category = "character" | "tile" | "prop";

export const FRAMING: Record<Category, string> = {
  character:
    "Full body chibi character, transparent background, tall 2:3 sprite portrait, readable silhouette, centered pose.",
  tile: "Seamless tileable top-down tile, edge-to-edge texture, square 1:1, no border, no perspective tilt.",
  prop: "Single object prop, transparent background, square 1:1 icon sprite, centered and fully visible.",
};

export interface Asset {
  category: Category;
  body: Record<ThemeId, string>;
}

export const ASSETS: Record<string, Asset> = {
  knight_m: {
    category: "character",
    body: {
      cyber:
        "Orchestrator hooded operator in dark techwear hoodie, glowing cyan circuit trim, holographic visor, stylus-blade command tool.",
      lofi: "Orchestrator in a cozy hoodie with over-ear headphones, holding a steaming coffee mug.",
    },
  },
  knight_f: {
    category: "character",
    body: {
      cyber:
        "Warden QA agent in a techwear jacket, earpiece HUD, scan lens, precise inspection stance.",
      lofi: "Warden QA dev in a cardigan and glasses, holding a magnifier and checklist.",
    },
  },
  wizzard_m: {
    category: "character",
    body: {
      cyber:
        "Surveyor code-scout AI in a dark coat, violet neon runes, glowing staff, floating code glyphs.",
      lofi: "Surveyor code reader in a knit cardigan, holding a glowing tablet of code.",
    },
  },
  wizzard_f: {
    category: "character",
    body: {
      cyber:
        "Data-mage analytics AI in a violet-lit robe-coat, holding a holographic data orb.",
      lofi: "Data analyst dev in an oversized sweater, carrying a notebook of charts.",
    },
  },
  elf_m: {
    category: "character",
    body: {
      cyber:
        "Frontend scout agent with chrome-and-cyan body, floating UI panel, neon visor.",
      lofi: "Frontend dev in a hoodie, holding a sketch tablet and stylus.",
    },
  },
  elf_f: {
    category: "character",
    body: {
      cyber:
        "Scribe docs agent in a neon-trimmed bodysuit, reading a floating document panel.",
      lofi: "Scribe docs dev in a pastel sweater, holding an open notebook and pen.",
    },
  },
  dwarf_m: {
    category: "character",
    body: {
      cyber:
        "Quartermaster deps/infra bot with armored chassis, cyan vents, wrench-tool.",
      lofi: "Quartermaster infra dev in an apron over hoodie, holding a wrench and coffee.",
    },
  },
  dwarf_f: {
    category: "character",
    body: {
      cyber:
        "Devops agent with reinforced body, cyan status lights, floating deploy token.",
      lofi: "Devops dev in a beanie with tool-belt and deploy checklist.",
    },
  },
  lizard_m: {
    category: "character",
    body: {
      cyber:
        "Tinker build agent with streamlined droid chassis and build-beam tool.",
      lofi: "Tinker build dev with rolled sleeves, soldering iron and gears.",
    },
  },
  lizard_f: {
    category: "character",
    body: {
      cyber: "Crawler/data agent with cyan sensor stripes and radar ping.",
      lofi: "Researcher dev with scarf, open tabs/papers arranged around them.",
    },
  },
  goblin: {
    category: "character",
    body: {
      cyber:
        "Tiny utility linter bot with round chassis and one glowing cyan eye.",
      lofi: "Tiny helper intern with oversized beanie and sticky-note.",
    },
  },
  angel: {
    category: "character",
    body: {
      cyber: "Monitor guardian AI with cyan halo ring and sentinel body.",
      lofi: "Guardian dev with desk-lamp halo and uptime clipboard.",
    },
  },
  floor_1: {
    category: "tile",
    body: {
      cyber:
        "Seamless top-down WORK-FLOOR, dark brushed-metal panel with cyan circuit seams.",
      lofi: "Warm honey wooden plank work-floor, cozy and clean.",
    },
  },
  floor_2: {
    category: "tile",
    body: {
      cyber:
        "Metal floor variant with darker modular plates and subtle neon screw points.",
      lofi: "Wooden floor variant with slightly lighter planks and soft worn edges.",
    },
  },
  floor_3: {
    category: "tile",
    body: {
      cyber:
        "Metal floor accent with cyan vent grille and dark service-panel rhythm.",
      lofi: "Wooden floor accent with knot/seam detail and warm studio wear.",
    },
  },
  grass: {
    category: "tile",
    body: {
      cyber: "Synthetic turf with cyan grid glow for an indoor tech courtyard.",
      lofi: "Cozy garden courtyard grass with soft natural patches.",
    },
  },
  wall_mid: {
    category: "tile",
    body: {
      cyber: "Server-rack panels with neon status lights/cables.",
      lofi: "Warm plaster wall with wooden batten/framed note.",
    },
  },
  wall_top: {
    category: "tile",
    body: {
      cyber: "Dark metal trim with cyan edge light for a workspace wall cap.",
      lofi: "Warm wood molding for a cozy workspace wall top.",
    },
  },
  banner: {
    category: "prop",
    body: {
      cyber: "Hanging workspace banner with terminal prompt emblem.",
      lofi: "Felt pennant with coffee-cup emblem.",
    },
  },
  fountain_top: {
    category: "prop",
    body: {
      cyber: "TOP server core segment with data-crystal finial.",
      lofi: "TOP coffee bar fixture with hanging lamp and mugs.",
    },
  },
  fountain_mid: {
    category: "prop",
    body: {
      cyber: "MID server-core column, server stack, light bars, cables.",
      lofi: "MID coffee bar, wooden counter, coffee machine, steam.",
    },
  },
  fountain_basin: {
    category: "prop",
    body: {
      cyber: "BASE/basin server-core, plinth, glowing cyan coolant pool.",
      lofi: "BASE coffee bar, wooden base, warm rug.",
    },
  },
  crate: {
    category: "prop",
    body: {
      cyber: "Deploy crate with reinforced corners and small status label.",
      lofi: "Cardboard storage box with taped edge and soft label.",
    },
  },
  skull: {
    category: "prop",
    body: {
      cyber: "Error/bug totem chip with warning mark and tiny cyan traces.",
      lofi: "Cute ceramic mug shaped like sleepy face.",
    },
  },
  flask: {
    category: "prop",
    body: {
      cyber: "Neon energy drink can with cyan glow and compact label.",
      lofi: "Warm latte mug with foam and cozy ceramic glaze.",
    },
  },
  coin: {
    category: "prop",
    body: {
      cyber: "Cyan hexagonal credit token with beveled pixel edge.",
      lofi: "Golden star token/cookie coin with warm baked shine.",
    },
  },
  chest_empty: {
    category: "prop",
    body: {
      cyber: "Opened empty data vault with dark interior and cyan rim light.",
      lofi: "Opened empty wooden chest with warm interior shadow.",
    },
  },
  chest_full: {
    category: "prop",
    body: {
      cyber: "Reward data vault with violet data shards and cyan PR badge.",
      lofi: "Wooden treasure chest with trinkets and shipped ribbon.",
    },
  },
  door_frame: {
    category: "prop",
    body: {
      cyber: "TOP lintel neon zone doorway with dark metal frame.",
      lofi: "TOP lintel warm wooden doorway with cozy trim.",
    },
  },
  door_leaf: {
    category: "prop",
    body: {
      cyber: "Closed neon door leaf with cyan/violet energy surface.",
      lofi: "Closed warm wooden door leaf with simple handle.",
    },
  },
};

export const OVERRIDE_MAP: Record<string, string> = {
  knight_m: "knight_m",
  knight_f: "knight_f",
  wizzard_m: "wizzard_m",
  wizzard_f: "wizzard_f",
  elf_m: "elf_m",
  elf_f: "elf_f",
  dwarf_m: "dwarf_m",
  dwarf_f: "dwarf_f",
  lizard_m: "lizard_m",
  lizard_f: "lizard_f",
  goblin: "goblin",
  angel: "angel",
  floor_1: "floor_1",
  floor_2: "floor_2",
  floor_3: "floor_3",
  grass: "grass",
  "edge-tl": "floor_1",
  "edge-tr": "floor_1",
  "edge-bl": "floor_1",
  "edge-br": "floor_1",
  "edge-top": "floor_1",
  "edge-bottom": "floor_1",
  "edge-left": "floor_1",
  "edge-right": "floor_1",
  wall_mid: "wall_mid",
  wall_top_mid: "wall_top",
  wall_banner_blue: "banner",
  wall_banner_green: "banner",
  wall_banner_yellow: "banner",
  wall_fountain_top_1: "fountain_top",
  wall_fountain_mid_blue_anim_f0: "fountain_mid",
  wall_fountain_basin_blue_anim_f0: "fountain_basin",
  crate: "crate",
  skull: "skull",
  flask_big_green: "flask",
  flask_big_blue: "flask",
  flask_big_red: "flask",
  coin_anim_f0: "coin",
  coin_anim_f1: "coin",
  coin_anim_f2: "coin",
  coin_anim_f3: "coin",
  chest_empty_open_anim_f0: "chest_empty",
  chest_full_open_anim_f0: "chest_full",
  chest_full_open_anim_f1: "chest_full",
  chest_mimic_open_anim_f1: "chest_full",
  doors_frame_top: "door_frame",
  doors_leaf_closed: "door_leaf",
};

export interface Job {
  theme: ThemeId;
  asset: string;
  category: Category;
}

export function assemblePrompt(theme: ThemeId, asset: string): string {
  const entry = ASSETS[asset];
  if (!entry) {
    throw new Error(`unknown asset: ${asset}`);
  }

  return [
    STYLE_PREFIX[theme],
    entry.body[theme],
    FRAMING[entry.category],
    AVOID,
  ].join(" ");
}

export function listJobs(): Job[] {
  return THEMES.flatMap((theme) =>
    Object.entries(ASSETS).map(([asset, entry]) => ({
      theme,
      asset,
      category: entry.category,
    })),
  );
}
