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
