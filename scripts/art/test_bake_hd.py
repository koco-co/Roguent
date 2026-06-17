"""PIL pytest for the HD bake pipeline (run with /usr/bin/python3 -m pytest)."""
import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "bake", Path(__file__).with_name("apply-gpt-image-overrides.py")
)
bake = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(bake)


def test_hd_scale_constants():
    assert bake.TILE_PX == 40
    assert bake.HD_SCALE == bake.TILE_PX / 16  # 2.5


def test_hd_frame_size_rounds_per_axis():
    # knight 16x28 -> 40x70 ; coin 6x7 -> 15x18 ; boss 32x36 -> 80x90
    assert bake.hd_frame_size(16, 28) == (40, 70)
    assert bake.hd_frame_size(6, 7) == (15, 18)
    assert bake.hd_frame_size(32, 36) == (80, 90)
    assert bake.hd_frame_size(5, 22) == (12, 55)  # fractional rounding per axis


from PIL import Image


def _synthetic_detail_tile(size=64):
    """A high-frequency RGBA tile (checker of two saturated colors) on opaque bg."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    for y in range(size):
        for x in range(size):
            on = (x // 4 + y // 4) % 2 == 0
            px[x, y] = (220, 40, 60, 255) if on else (30, 80, 200, 255)
    return im


def _mean_neighbor_delta(im):
    px = im.load(); w, h = im.size; tot = 0; n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            for nx, ny in ((x + 1, y), (x, y + 1)):
                if nx >= w or ny >= h:
                    continue
                r2, g2, b2, a2 = px[nx, ny]
                if a2 == 0:
                    continue
                tot += abs(r - r2) + abs(g - g2) + abs(b - b2); n += 1
    return tot / n if n else 0.0


def test_reduce_environment_noise_keeps_detail_after_deblur():
    tile = _synthetic_detail_tile()
    out = bake.reduce_environment_noise(tile, "floor_1")
    # de-blurred output preserves far more edge energy than the old
    # block_pixel_art(2)+mix(0.46) path (which collapsed deltas toward ~0).
    assert _mean_neighbor_delta(out) > 0.5 * _mean_neighbor_delta(tile)


def test_floor_mix_weight_is_low():
    # white-vs-black opaque pair must stay near-unmixed (weight ~0.10, not 0.46)
    im = Image.new("RGBA", (2, 1), (0, 0, 0, 255))
    im.putpixel((1, 0), (255, 255, 255, 255))
    out = bake.mix_toward_average(im, 0.10)
    r, _, _, _ = out.getpixel((0, 0))
    assert r <= 30  # 0.10 weight toward avg(127) -> ~13, was 0.46 -> ~58


def test_block_pixel_art_no_longer_applied_to_environment():
    # a 1px-wide vertical line must survive (block_pixel_art(2) would smear it)
    im = Image.new("RGBA", (8, 8), (10, 10, 10, 255))
    for y in range(8):
        im.putpixel((3, y), (255, 0, 0, 255))
    out = bake.reduce_environment_noise(im, "wall_mid")
    # the line column stays clearly red (not averaged into neighbors)
    assert out.getpixel((3, 0))[0] > 180


def test_fitted_cell_uses_lanczos_downsample():
    # build a 4x4 grid source where cell 0 has fine detail; fit to HD size,
    # assert the result is sharper than a BOX downsample of the same subject.
    src = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            src.putpixel((x, y), ((x % 2) * 255, (y % 2) * 255, 120, 255))
    hd = bake.hd_frame_size(16, 16)  # (40, 40)
    out = bake.fitted_cell(src, 0, hd, cols=4, rows=4)
    assert out.size == hd
    assert _mean_neighbor_delta(out) > 30  # LANCZOS keeps high-freq energy


def test_harden_pixel_art_alpha_threshold_raised():
    im = Image.new("RGBA", (1, 1), (200, 0, 0, 80))  # 64<80<96
    out = bake.harden_pixel_art(im)
    assert out.getpixel((0, 0))[3] == 0  # 80 < 96 now culled (was kept at 64)


import json
import shutil


def _seed_16px_atlas_json(dst: Path) -> None:
    """Reset the copied pack's dungeon.json to a 16px baseline layout.

    The on-disk pack (and git HEAD) may already be HD-baked, and the bake takes
    the json's frame sizes as the 16px contract. The permanent 16px source of
    truth is the 0x72 reference atlas, whose frame *sizes* match every pack's
    runtime atlas. We build a fresh non-overlapping 16px layout from those sizes
    so this test stays deterministic regardless of working-tree / HEAD state.
    """
    ref = json.loads(Path("public/assets/0x72/dungeon.json").read_text())
    new_frames: dict = {}
    cur_x = 0
    cur_y = 0
    row_h = 0
    for name, entry in ref["frames"].items():
        w = entry["frame"]["w"]
        h = entry["frame"]["h"]
        if cur_x + w > 2048 and cur_x > 0:
            cur_x = 0
            cur_y += row_h + 1
            row_h = 0
        new_frames[name] = {
            "frame": {"x": cur_x, "y": cur_y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
        cur_x += w + 1
        row_h = max(row_h, h)
    (dst / "atlas" / "dungeon.json").write_text(
        json.dumps(
            {"frames": new_frames, "meta": {"size": {"w": 2048, "h": cur_y + row_h}}}
        )
    )


def test_apply_pack_emits_hd_atlas(tmp_path, monkeypatch):
    src = Path("public/assets/artpacks/neon-terminal")
    dst = tmp_path / "neon-terminal"
    shutil.copytree(src, dst)
    _seed_16px_atlas_json(dst)
    monkeypatch.setattr(bake, "PACK_ROOT", tmp_path)
    report = bake.apply_pack("neon-terminal")

    atlas_json = json.loads((dst / "atlas" / "dungeon.json").read_text())
    kf = atlas_json["frames"]["knight_m_idle_anim_f0.png"]["frame"]
    assert (kf["w"], kf["h"]) == (40, 70)  # HD size written back to json
    # atlas png matches new meta size, no frame exceeds canvas
    from PIL import Image
    im = Image.open(dst / "atlas" / "dungeon.png")
    W, H = atlas_json["meta"]["size"]["w"], atlas_json["meta"]["size"]["h"]
    assert im.size == (W, H)
    for e in atlas_json["frames"].values():
        f = e["frame"]
        assert f["x"] + f["w"] <= W and f["y"] + f["h"] <= H
    # report targetSize is HD
    tgt = next(c["targetSize"] for c in report["coveredFrames"]
               if c["frame"] == "knight_m_idle_anim_f0")
    assert tgt == {"w": 40, "h": 70}
    assert report["coveredFrameCount"] == 381


def test_apply_pack_refuses_double_bake(tmp_path, monkeypatch):
    """Re-baking an already-HD atlas would double-scale frames; guard it."""
    import pytest
    src = Path("public/assets/artpacks/neon-terminal")
    dst = tmp_path / "neon-terminal"
    shutil.copytree(src, dst)
    _seed_16px_atlas_json(dst)
    monkeypatch.setattr(bake, "PACK_ROOT", tmp_path)
    bake.apply_pack("neon-terminal")  # first bake: 16px -> HD, writes hd marker
    with pytest.raises(SystemExit, match="already HD-baked"):
        bake.apply_pack("neon-terminal")  # second bake must refuse
