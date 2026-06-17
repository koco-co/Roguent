"""Deterministic shelf-pack a TexturePacker frame dict at an HD scale.

Frames are packed in descending-height order into rows ("shelves") capped at
max_width; this wastes ~10-20% vs a true rect packer but is dependency-free
and reproducible. Returns (new_frames, (atlas_w, atlas_h)).
"""
from __future__ import annotations

GUTTER = 1  # 1px gap so nearest-neighbour sampling never bleeds across frames


def _scaled(v: int, scale: float) -> int:
    return round(v * scale)


def repack_atlas_frames(
    frames: dict, scale: float, max_width: int = 1024
) -> tuple[dict, tuple[int, int]]:
    # Stable order: tallest first, then by name for determinism.
    items = []
    for name, entry in frames.items():
        w = _scaled(entry["frame"]["w"], scale)
        h = _scaled(entry["frame"]["h"], scale)
        items.append((h, name, w))
    items.sort(key=lambda t: (-t[0], t[1]))

    new_frames: dict = {}
    cur_x = 0
    cur_y = 0
    row_h = 0
    atlas_w = 0
    for h, name, w in items:
        if cur_x + w > max_width and cur_x > 0:
            cur_x = 0
            cur_y += row_h + GUTTER
            row_h = 0
        src = frames[name]
        fw, fh = w, h
        new_frames[name] = {
            **src,
            "frame": {"x": cur_x, "y": cur_y, "w": fw, "h": fh},
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
            "sourceSize": {"w": fw, "h": fh},
        }
        cur_x += w + GUTTER
        atlas_w = max(atlas_w, cur_x - GUTTER)
        row_h = max(row_h, h)
    atlas_h = cur_y + row_h
    return new_frames, (atlas_w, atlas_h)
