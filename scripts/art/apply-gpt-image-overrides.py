#!/usr/bin/env python3
"""Apply GPT-image source-sheet cells onto frame-compatible artpack atlases.

This is intentionally conservative: it preserves the existing TexturePacker
JSON and only replaces selected frame rectangles in atlas/dungeon.png.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, TypedDict

from PIL import Image


PACKS = ("neon-terminal", "holo-blueprint", "deep-space", "synthwave")
PACK_ROOT = Path("public/assets/artpacks")


class Override(TypedDict, total=False):
    category: str
    sourceSheet: str
    sourceCell: int
    sourceCols: int
    sourceRows: int
    cleanup: str
    variant: str
    frame: str


ITEM_OVERRIDES: tuple[Override, ...] = (
    *[
        {
            "category": "props",
            "sourceSheet": "items/props.png",
            "sourceCell": 0,
            "frame": f"coin_anim_f{i}",
        }
        for i in range(4)
    ],
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 1,
        "frame": "flask_blue",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 2,
        "frame": "flask_green",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 3,
        "frame": "flask_red",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 11,
        "frame": "flask_yellow",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 4,
        "frame": "chest_full_open_anim_f0",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 5,
        "frame": "chest_full_open_anim_f1",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 5,
        "frame": "chest_full_open_anim_f2",
    },
    *[
        {
            "category": "props",
            "sourceSheet": "items/props.png",
            "sourceCell": 7,
            "frame": f"bomb_f{i}",
        }
        for i in range(3)
    ],
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 8,
        "frame": "weapon_knight_sword",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 8,
        "frame": "weapon_regular_sword",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 9,
        "frame": "crate",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 10,
        "frame": "skull",
    },
)

TILE_OVERRIDES: tuple[Override, ...] = (
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 0,
        "frame": "floor_1",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 1,
        "frame": "floor_2",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 2,
        "frame": "grass",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 2,
        "frame": "grass2",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 3,
        "frame": "wall_mid",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 3,
        "frame": "wall_top_mid",
    },
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 4,
            "frame": frame,
        }
        for frame in ("wall_banner_blue", "wall_banner_green", "wall_banner_red", "wall_banner_yellow")
    ],
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 6,
        "frame": "wall_fountain_top_1",
    },
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 6,
            "frame": f"wall_fountain_mid_blue_anim_f{i}",
        }
        for i in range(3)
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 8,
            "frame": f"wall_fountain_basin_blue_anim_f{i}",
        }
        for i in range(3)
    ],
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 9,
        "frame": "doors_leaf_closed",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 10,
        "frame": "doors_leaf_open",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 11,
        "frame": "column",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 11,
        "frame": "column_wall",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 13,
        "frame": "floor_ladder",
    },
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 14,
            "frame": f"floor_spikes_anim_f{i}",
        }
        for i in range(4)
    ],
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 15,
        "frame": "floor_3",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 15,
        "frame": "floor_4",
    },
)

EXTRA_ITEM_OVERRIDES: tuple[Override, ...] = (
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 4,
        "frame": "chest_empty_open_anim_f0",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 5,
        "frame": "chest_empty_open_anim_f1",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 5,
        "frame": "chest_empty_open_anim_f2",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 1,
        "frame": "flask_big_blue",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 2,
        "frame": "flask_big_green",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 3,
        "frame": "flask_big_red",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 11,
        "frame": "flask_big_yellow",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 15,
        "frame": "lever_left",
    },
    {
        "category": "props",
        "sourceSheet": "items/props.png",
        "sourceCell": 15,
        "variant": "flip-x",
        "frame": "lever_right",
    },
    *[
        {
            "category": "props",
            "sourceSheet": "items/props.png",
            "sourceCell": 8,
            "frame": frame,
        }
        for frame in (
            "weapon_anime_sword",
            "weapon_arrow",
            "weapon_axe",
            "weapon_baton_with_spikes",
            "weapon_big_hammer",
            "weapon_bow",
            "weapon_bow_2",
            "weapon_cleaver",
            "weapon_double_axe",
            "weapon_duel_sword",
            "weapon_golden_sword",
            "weapon_green_magic_staff",
            "weapon_hammer",
            "weapon_katana",
            "weapon_knife",
            "weapon_lavish_sword",
            "weapon_mace",
            "weapon_machete",
            "weapon_red_gem_sword",
            "weapon_red_magic_staff",
            "weapon_rusty_sword",
            "weapon_saw_sword",
            "weapon_spear",
            "weapon_throwing_axe",
            "weapon_waraxe",
        )
    ],
)

EXTRA_TILE_OVERRIDES: tuple[Override, ...] = (
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 0,
        "frame": "floor_5",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 1,
        "frame": "floor_6",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 15,
        "frame": "floor_7",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 0,
        "frame": "floor_8",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 13,
        "frame": "floor_stairs",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 2,
        "frame": "ground",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 10,
        "frame": "hole",
    },
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 10,
            "frame": frame,
        }
        for frame in ("doors_frame_left", "doors_frame_right", "doors_frame_top")
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 0,
            "frame": frame,
        }
        for frame in (
            "edge-bl",
            "edge-bottom",
            "edge-br",
            "edge-left",
            "edge-right",
            "edge-tl",
            "edge-top",
            "edge-tr",
            "edge_down",
        )
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 3,
            "frame": frame,
        }
        for frame in (
            "wall_edge_bottom_left",
            "wall_edge_bottom_right",
            "wall_edge_left",
            "wall_edge_mid_left",
            "wall_edge_mid_right",
            "wall_edge_right",
            "wall_edge_top_left",
            "wall_edge_top_right",
            "wall_edge_tshape_bottom_left",
            "wall_edge_tshape_bottom_right",
            "wall_edge_tshape_left",
            "wall_edge_tshape_right",
        )
    ],
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 7,
        "frame": "wall_fountain_top_2",
    },
    {
        "category": "environment",
        "sourceSheet": "tiles/environment.png",
        "sourceCell": 7,
        "frame": "wall_fountain_top_3",
    },
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 6,
            "frame": f"wall_fountain_mid_red_anim_f{i}",
        }
        for i in range(3)
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 8,
            "frame": f"wall_fountain_basin_red_anim_f{i}",
        }
        for i in range(3)
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 2,
            "frame": frame,
        }
        for frame in ("wall_goo", "wall_goo_base")
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 10,
            "frame": frame,
        }
        for frame in ("wall_hole_1", "wall_hole_2")
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 3,
            "frame": frame,
        }
        for frame in ("wall_left", "wall_right", "wall_top_left", "wall_top_right")
    ],
    *[
        {
            "category": "environment",
            "sourceSheet": "tiles/environment.png",
            "sourceCell": 12,
            "frame": frame,
        }
        for frame in (
            "wall_outer_front_left",
            "wall_outer_front_right",
            "wall_outer_mid_left",
            "wall_outer_mid_right",
            "wall_outer_top_left",
            "wall_outer_top_right",
        )
    ],
)

def character_frames(prefix: str, source_cell: int, include_hit: bool = True) -> tuple[Override, ...]:
    frames = []
    if include_hit:
        frames.append(f"{prefix}_hit_anim_f0")
    frames.extend(f"{prefix}_idle_anim_f{i}" for i in range(4))
    frames.extend(f"{prefix}_run_anim_f{i}" for i in range(4))
    return tuple(
        {
            "category": "characters",
            "sourceSheet": "characters/npcs.png",
            "sourceCell": source_cell,
            "frame": frame,
        }
        for frame in frames
    )


CHARACTER_OVERRIDES: tuple[Override, ...] = (
    *character_frames("knight_m", 11),
    *character_frames("knight_f", 1),
    *character_frames("wizzard_m", 4),
    *character_frames("wizzard_f", 3),
    *character_frames("elf_m", 5),
    *character_frames("elf_f", 6),
    *character_frames("dwarf_m", 7),
    *character_frames("dwarf_f", 9),
    *character_frames("lizard_m", 10),
    *character_frames("lizard_f", 8),
    *character_frames("goblin", 10, include_hit=False),
    *character_frames("doc", 6, include_hit=False),
)


def idle_run_frame_names(prefix: str) -> list[str]:
    return [
        *(f"{prefix}_idle_anim_f{i}" for i in range(4)),
        *(f"{prefix}_run_anim_f{i}" for i in range(4)),
    ]


def source_row_overrides(
    *,
    category: str,
    source_sheet: str,
    source_cols: int,
    source_rows: int,
    row: int,
    frames: list[str],
    source_cols_for_frames: list[int],
) -> tuple[Override, ...]:
    return tuple(
        {
            "category": category,
            "sourceSheet": source_sheet,
            "sourceCell": row * source_cols + source_col,
            "sourceCols": source_cols,
            "sourceRows": source_rows,
            "cleanup": "dark-grid",
            "frame": frame,
        }
        for frame, source_col in zip(frames, source_cols_for_frames)
    )


def enemy_16x16_row(prefix: str, row: int) -> tuple[Override, ...]:
    return source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x16.png",
        source_cols=8,
        source_rows=4,
        row=row,
        frames=idle_run_frame_names(prefix),
        source_cols_for_frames=list(range(8)),
    )


def enemy_16x16_anim_row(prefix: str, row: int) -> tuple[Override, ...]:
    return source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x16.png",
        source_cols=8,
        source_rows=4,
        row=row,
        frames=[f"{prefix}_anim_f{i}" for i in range(4)],
        source_cols_for_frames=list(range(4)),
    )


def enemy_16x23_row(prefix: str, row: int) -> tuple[Override, ...]:
    return source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x23.png",
        source_cols=7,
        source_rows=8,
        row=row,
        frames=idle_run_frame_names(prefix),
        source_cols_for_frames=[0, 1, 2, 3, 4, 5, 6, 6],
    )


def enemy_16x23_anim_row(prefix: str, row: int) -> tuple[Override, ...]:
    return source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x23.png",
        source_cols=7,
        source_rows=8,
        row=row,
        frames=[f"{prefix}_anim_f{i}" for i in range(4)],
        source_cols_for_frames=list(range(4)),
    )


def boss_row(prefix: str, row: int) -> tuple[Override, ...]:
    return source_row_overrides(
        category="bosses",
        source_sheet="enemies/bosses-32x36.png",
        source_cols=7,
        source_rows=3,
        row=row,
        frames=idle_run_frame_names(prefix),
        source_cols_for_frames=[0, 1, 2, 3, 4, 5, 6, 6],
    )


ENEMY_OVERRIDES: tuple[Override, ...] = (
    *enemy_16x16_row("imp", 0),
    *enemy_16x16_row("angel", 1),
    *enemy_16x16_anim_row("ice_zombie", 2),
    *enemy_16x16_anim_row("muddy", 3),
    *enemy_16x23_row("chort", 0),
    *enemy_16x23_row("masked_orc", 1),
    *enemy_16x23_row("orc_shaman", 2),
    *enemy_16x23_row("orc_warrior", 3),
    *enemy_16x23_anim_row("necromancer", 4),
    *enemy_16x23_anim_row("swampy", 5),
    *source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x23.png",
        source_cols=7,
        source_rows=8,
        row=6,
        frames=["zombie_anim_f1", "zombie_anim_f2", "zombie_anim_f3", "zombie_anim_f10"],
        source_cols_for_frames=list(range(4)),
    ),
    *enemy_16x23_row("skelet", 7),
)

EXTRA_ENEMY_OVERRIDES: tuple[Override, ...] = (
    *enemy_16x23_row("pumpkin_dude", 1),
    *enemy_16x16_anim_row("slug", 3),
    *enemy_16x16_anim_row("tiny_slug", 3),
    *source_row_overrides(
        category="enemies",
        source_sheet="enemies/enemies-16x16.png",
        source_cols=8,
        source_rows=4,
        row=2,
        frames=idle_run_frame_names("tiny_zombie"),
        source_cols_for_frames=list(range(8)),
    ),
    *enemy_16x23_row("wogol", 7),
)

BOSS_OVERRIDES: tuple[Override, ...] = (
    *boss_row("big_demon", 0),
    *boss_row("big_zombie", 1),
    *boss_row("ogre", 2),
)

EASTER_OVERRIDES: tuple[Override, ...] = tuple(
    {
        "category": "easter",
        "sourceSheet": "easter/sprites.png",
        "sourceCell": 4 + i,
        "sourceCols": 4,
        "sourceRows": 2,
        "cleanup": "light-bg+largest-alpha",
        "frame": f"chest_mimic_open_anim_f{i}",
    }
    for i in range(3)
)

HUD_OVERRIDES: tuple[Override, ...] = (
    {
        "category": "hud",
        "sourceSheet": "hud/icons.png",
        "sourceCell": 0,
        "sourceCols": 8,
        "sourceRows": 5,
        "cleanup": "light-bg+largest-alpha",
        "frame": "ui_heart_full",
    },
    {
        "category": "hud",
        "sourceSheet": "hud/icons.png",
        "sourceCell": 0,
        "sourceCols": 8,
        "sourceRows": 5,
        "cleanup": "light-bg+largest-alpha",
        "variant": "heart-half",
        "frame": "ui_heart_half",
    },
    {
        "category": "hud",
        "sourceSheet": "hud/icons.png",
        "sourceCell": 0,
        "sourceCols": 8,
        "sourceRows": 5,
        "cleanup": "light-bg+largest-alpha",
        "variant": "heart-empty",
        "frame": "ui_heart_empty",
    },
)

UI_OVERRIDES: tuple[Override, ...] = (
    {
        "category": "ui",
        "sourceSheet": "ui/buttons.png",
        "sourceCell": 2,
        "cleanup": "largest-alpha",
        "frame": "button_blue_up",
    },
    {
        "category": "ui",
        "sourceSheet": "ui/buttons.png",
        "sourceCell": 2,
        "cleanup": "largest-alpha",
        "variant": "button-pressed",
        "frame": "button_blue_down",
    },
    {
        "category": "ui",
        "sourceSheet": "ui/buttons.png",
        "sourceCell": 7,
        "cleanup": "largest-alpha",
        "frame": "button_red_up",
    },
    {
        "category": "ui",
        "sourceSheet": "ui/buttons.png",
        "sourceCell": 7,
        "cleanup": "largest-alpha",
        "variant": "button-pressed",
        "frame": "button_red_down",
    },
)

OVERRIDES = (
    *CHARACTER_OVERRIDES,
    *ENEMY_OVERRIDES,
    *EXTRA_ENEMY_OVERRIDES,
    *BOSS_OVERRIDES,
    *ITEM_OVERRIDES,
    *EXTRA_ITEM_OVERRIDES,
    *TILE_OVERRIDES,
    *EXTRA_TILE_OVERRIDES,
    *EASTER_OVERRIDES,
    *HUD_OVERRIDES,
    *UI_OVERRIDES,
)


def cell_bounds(size: tuple[int, int], index: int, cols: int = 4, rows: int = 4) -> tuple[int, int, int, int]:
    width, height = size
    col = index % cols
    row = index // cols
    left = round((col * width) / cols)
    right = round(((col + 1) * width) / cols)
    top = round((row * height) / rows)
    bottom = round(((row + 1) * height) / rows)
    return left, top, right, bottom


def clean_dark_grid(crop: Image.Image) -> Image.Image:
    cleaned = crop.copy()
    pix = cleaned.load()
    width, height = cleaned.size
    border = max(4, round(min(width, height) * 0.05))
    near_white_points: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = pix[x, y]
            near_black = r <= 8 and g <= 8 and b <= 8
            near_white = r >= 170 and g >= 170 and b >= 170 and max(r, g, b) - min(r, g, b) <= 48
            near_white_border = (
                (x < border or y < border or x >= width - border or y >= height - border)
                and near_white
            )
            if near_black or near_white_border:
                pix[x, y] = (r, g, b, 0)
            elif near_white:
                near_white_points.append((x, y))

    row_counts: dict[int, int] = {}
    col_counts: dict[int, int] = {}
    for x, y in near_white_points:
        row_counts[y] = row_counts.get(y, 0) + 1
        col_counts[x] = col_counts.get(x, 0) + 1
    line_rows = {row for row, count in row_counts.items() if count >= width * 0.28}
    line_cols = {col for col, count in col_counts.items() if count >= height * 0.28}
    for x, y in near_white_points:
        if y in line_rows or x in line_cols:
            r, g, b, _ = pix[x, y]
            pix[x, y] = (r, g, b, 0)
    return cleaned


def clean_light_background(crop: Image.Image) -> Image.Image:
    """Remove GPT-image checkerboard/near-white matte connected to cell edges."""
    cleaned = crop.copy()
    pix = cleaned.load()
    width, height = cleaned.size

    def is_background_pixel(x: int, y: int) -> bool:
        r, g, b, a = pix[x, y]
        if a == 0:
            return False
        neutral = max(r, g, b) - min(r, g, b) <= 42
        return (neutral and max(r, g, b) >= 116) or (r >= 232 and g >= 232 and b >= 232)

    stack: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))

    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        if not is_background_pixel(x, y):
            continue
        r, g, b, _ = pix[x, y]
        pix[x, y] = (r, g, b, 0)
        stack.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    return cleaned


def keep_largest_alpha_component(crop: Image.Image) -> Image.Image:
    alpha = crop.getchannel("A")
    pix = alpha.load()
    width, height = alpha.size
    seen: set[tuple[int, int]] = set()
    largest: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pix[x, y] == 0:
                continue
            component: set[tuple[int, int]] = set()
            stack = [(x, y)]
            while stack:
                cx, cy = stack.pop()
                if (
                    (cx, cy) in seen
                    or cx < 0
                    or cy < 0
                    or cx >= width
                    or cy >= height
                    or pix[cx, cy] == 0
                ):
                    continue
                seen.add((cx, cy))
                component.add((cx, cy))
                stack.extend(((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)))
            if len(component) > len(largest):
                largest = component

    if not largest:
        return crop

    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    src_pix = crop.load()
    out_pix = out.load()
    for x, y in largest:
        out_pix[x, y] = src_pix[x, y]
    return out


def clean_source_cell(crop: Image.Image, cleanup: str | None) -> Image.Image:
    if not cleanup:
        return crop

    cleaned = crop
    for step in cleanup.split("+"):
        if step == "dark-grid":
            cleaned = clean_dark_grid(cleaned)
        elif step == "light-bg":
            cleaned = clean_light_background(cleaned)
        elif step == "largest-alpha":
            cleaned = keep_largest_alpha_component(cleaned)
        else:
            raise ValueError(f"unknown cleanup step: {step}")
    return cleaned


def darken(sprite: Image.Image, factor: float) -> Image.Image:
    out = sprite.copy()
    pix = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pix[x, y]
            if a == 0:
                continue
            pix[x, y] = (
                max(0, min(255, round(r * factor))),
                max(0, min(255, round(g * factor))),
                max(0, min(255, round(b * factor))),
                a,
            )
    return out


def press_button(sprite: Image.Image) -> Image.Image:
    width, height = sprite.size
    out = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    pressed = darken(sprite, 0.72)
    out.alpha_composite(pressed.crop((0, 0, width, height - 1)), (0, 1))
    return out


def heart_outline(sprite: Image.Image) -> Image.Image:
    alpha = sprite.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return sprite

    width, height = sprite.size
    src_pix = sprite.load()
    alpha_pix = alpha.load()
    out = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    out_pix = out.load()
    for y in range(height):
        for x in range(width):
            if alpha_pix[x, y] == 0:
                continue
            edge = x == 0 or y == 0 or x == width - 1 or y == height - 1
            if not edge:
                edge = any(
                    alpha_pix[nx, ny] == 0
                    for nx in range(x - 1, x + 2)
                    for ny in range(y - 1, y + 2)
                    if nx != x or ny != y
                )
            if edge:
                _, _, _, a = src_pix[x, y]
                out_pix[x, y] = (128, 18, 30, max(a, 220))
    return out


def half_heart(sprite: Image.Image) -> Image.Image:
    out = heart_outline(sprite)
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        return out

    cut = bbox[0] + max(1, round((bbox[2] - bbox[0]) * 0.56))
    src_pix = sprite.load()
    out_pix = out.load()
    for y in range(bbox[1], bbox[3]):
        for x in range(bbox[0], min(cut, bbox[2])):
            r, g, b, a = src_pix[x, y]
            if a:
                out_pix[x, y] = (r, g, b, a)
    return out


def apply_variant(sprite: Image.Image, variant: str | None) -> Image.Image:
    if variant is None:
        return sprite
    if variant == "button-pressed":
        return press_button(sprite)
    if variant == "heart-half":
        return half_heart(sprite)
    if variant == "heart-empty":
        return heart_outline(sprite)
    if variant == "flip-x":
        return sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    raise ValueError(f"unknown sprite variant: {variant}")


def fitted_cell(
    source: Image.Image,
    cell: int,
    target_size: tuple[int, int],
    cols: int = 4,
    rows: int = 4,
    cleanup: str | None = None,
) -> Image.Image:
    crop = source.crop(cell_bounds(source.size, cell, cols, rows)).convert("RGBA")
    crop = clean_source_cell(crop, cleanup)
    bbox = crop.getchannel("A").getbbox()
    if bbox is None:
        return Image.new("RGBA", target_size, (0, 0, 0, 0))

    subject = crop.crop(bbox)
    target_w, target_h = target_size
    scale = min(target_w / subject.width, target_h / subject.height)
    new_size = (
        max(1, min(target_w, round(subject.width * scale))),
        max(1, min(target_h, round(subject.height * scale))),
    )
    resized = subject.resize(new_size, Image.Resampling.NEAREST)
    out = Image.new("RGBA", target_size, (0, 0, 0, 0))
    out.alpha_composite(
        resized,
        ((target_w - resized.width) // 2, (target_h - resized.height) // 2),
    )
    return out


def frame_key(frame: str) -> str:
    return frame if frame.endswith(".png") else f"{frame}.png"


def iter_packs(selected: str | None) -> Iterable[str]:
    if selected:
        if selected not in PACKS:
            raise SystemExit(f"unknown pack: {selected}")
        yield selected
        return
    yield from PACKS


def apply_pack(pack_id: str) -> dict[str, object]:
    pack_root = PACK_ROOT / pack_id
    atlas_path = pack_root / "atlas" / "dungeon.png"
    atlas_json_path = pack_root / "atlas" / "dungeon.json"
    report_path = pack_root / "atlas" / "gpt-image-overrides.json"

    atlas = Image.open(atlas_path).convert("RGBA")
    atlas_json = json.loads(atlas_json_path.read_text())
    frames = atlas_json["frames"]
    source_cache: dict[str, Image.Image] = {}
    covered: list[dict[str, object]] = []
    missing: list[str] = []

    for override in OVERRIDES:
        key = frame_key(override["frame"])
        entry = frames.get(key)
        if not entry:
            missing.append(override["frame"])
            continue

        source_sheet = override["sourceSheet"]
        source = source_cache.get(source_sheet)
        if source is None:
            source = Image.open(pack_root / source_sheet).convert("RGBA")
            source_cache[source_sheet] = source

        frame = entry["frame"]
        target_size = (frame["w"], frame["h"])
        sprite = fitted_cell(
            source,
            override["sourceCell"],
            target_size,
            override.get("sourceCols", 4),
            override.get("sourceRows", 4),
            override.get("cleanup"),
        )
        sprite = apply_variant(sprite, override.get("variant"))
        atlas.paste(
            Image.new("RGBA", target_size, (0, 0, 0, 0)),
            (frame["x"], frame["y"]),
        )
        atlas.alpha_composite(sprite, (frame["x"], frame["y"]))
        covered.append(
            {
                **override,
                "method": "source-sheet-cell-fit",
                "targetSize": {"w": target_size[0], "h": target_size[1]},
            }
        )

    if missing:
        raise SystemExit(f"{pack_id}: missing atlas frames: {', '.join(missing)}")

    atlas.save(atlas_path)
    by_category: dict[str, int] = {}
    for item in covered:
        category = str(item["category"])
        by_category[category] = by_category.get(category, 0) + 1

    all_frames_covered = len(covered) == len(frames)
    coverage_notes = [
        "Generated source sheets remain the art direction source of truth.",
        (
            "All runtime atlas frames are represented by fitted GPT-image source-sheet cells."
            if all_frames_covered
            else "This report covers the subset of runtime atlas frames currently replaced by fitted GPT-image source-sheet cells."
        ),
        (
            "No runtime atlas frames remain on the compatible palette-mapped fallback."
            if all_frames_covered
            else "Unlisted frames still use the compatible palette-mapped atlas and require later frame-specific GPT-image slicing."
        ),
    ]

    report = {
        "schemaVersion": 1,
        "packId": pack_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "method": "source-sheet-cell-fit",
        "sourceSheets": sorted({item["sourceSheet"] for item in covered}),
        "atlasFrameCount": len(frames),
        "coveredFrameCount": len(covered),
        "coveredFramesByCategory": by_category,
        "coveredFrames": covered,
        "notes": coverage_notes,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", choices=PACKS)
    args = parser.parse_args()

    for pack_id in iter_packs(args.pack):
        report = apply_pack(pack_id)
        print(
            f"{pack_id}: {report['coveredFrameCount']} frames from "
            f"{', '.join(report['sourceSheets'])}"
        )


if __name__ == "__main__":
    main()
