import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "repack", Path(__file__).with_name("repack_atlas.py")
)
repack = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(repack)


def _frames():
    return {
        "a.png": {"frame": {"x": 0, "y": 0, "w": 16, "h": 28},
                  "rotated": False, "trimmed": False,
                  "spriteSourceSize": {"x": 0, "y": 0, "w": 16, "h": 28},
                  "sourceSize": {"w": 16, "h": 28},
                  "anchor": {"x": 0.5, "y": 0.5}},
        "b.png": {"frame": {"x": 16, "y": 0, "w": 6, "h": 7},
                  "rotated": False, "trimmed": False,
                  "spriteSourceSize": {"x": 0, "y": 0, "w": 6, "h": 7},
                  "sourceSize": {"w": 6, "h": 7},
                  "anchor": {"x": 0.5, "y": 0.5}},
    }


def test_repack_scales_each_frame_size():
    new_frames, size = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
    assert new_frames["a.png"]["frame"]["w"] == 40
    assert new_frames["a.png"]["frame"]["h"] == 70
    assert new_frames["b.png"]["frame"]["w"] == 15
    assert new_frames["b.png"]["frame"]["h"] == 18
    # sourceSize/spriteSourceSize scaled too (TexturePacker contract stays consistent)
    assert new_frames["a.png"]["sourceSize"] == {"w": 40, "h": 70}


def test_repack_no_overlap_and_within_bounds():
    new_frames, (W, H) = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
    rects = [(e["frame"]["x"], e["frame"]["y"], e["frame"]["w"], e["frame"]["h"])
             for e in new_frames.values()]
    for x, y, w, h in rects:
        assert x >= 0 and y >= 0 and x + w <= W and y + h <= H
    # pairwise no-overlap
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            ax, ay, aw, ah = rects[i]; bx, by, bw, bh = rects[j]
            assert ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay


def test_repack_meta_size_covers_all_frames():
    new_frames, (W, H) = repack.repack_atlas_frames(_frames(), scale=2.5, max_width=1024)
    maxx = max(e["frame"]["x"] + e["frame"]["w"] for e in new_frames.values())
    maxy = max(e["frame"]["y"] + e["frame"]["h"] for e in new_frames.values())
    assert W >= maxx and H >= maxy
    assert W <= 1024
