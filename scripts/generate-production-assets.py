#!/usr/bin/env python3
"""Generate deterministic production image assets for the Odysseus app."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "images"


def clamp(value: float, lower: int = 0, upper: int = 255) -> int:
    return max(lower, min(upper, round(value)))


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(clamp(a[index] + (b[index] - a[index]) * t) for index in range(3))


def blend(dst: tuple[int, int, int, int], src: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    sr, sg, sb, sa = src
    dr, dg, db, da = dst
    source_alpha = sa / 255
    dest_alpha = da / 255
    out_alpha = source_alpha + dest_alpha * (1 - source_alpha)
    if out_alpha <= 0:
        return (0, 0, 0, 0)
    return (
        clamp((sr * source_alpha + dr * dest_alpha * (1 - source_alpha)) / out_alpha),
        clamp((sg * source_alpha + dg * dest_alpha * (1 - source_alpha)) / out_alpha),
        clamp((sb * source_alpha + db * dest_alpha * (1 - source_alpha)) / out_alpha),
        clamp(out_alpha * 255),
    )


def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    def chunk(kind: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)

    payload = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


class Canvas:
    def __init__(self, size: int, background: tuple[int, int, int, int] | None = None):
        self.size = size
        fill = background or (0, 0, 0, 0)
        self.pixels = [[fill for _ in range(size)] for _ in range(size)]

    def composite(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < self.size and 0 <= y < self.size:
            self.pixels[y][x] = blend(self.pixels[y][x], color)

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        width: float,
        color: tuple[int, int, int, int],
    ) -> None:
        radius = width / 2
        min_x = math.floor(min(x1, x2) - radius)
        max_x = math.ceil(max(x1, x2) + radius)
        min_y = math.floor(min(y1, y2) - radius)
        max_y = math.ceil(max(y1, y2) + radius)
        dx = x2 - x1
        dy = y2 - y1
        length_sq = dx * dx + dy * dy
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                if length_sq == 0:
                    distance = math.hypot(x + 0.5 - x1, y + 0.5 - y1)
                else:
                    t = max(0, min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / length_sq))
                    px = x1 + t * dx
                    py = y1 + t * dy
                    distance = math.hypot(x + 0.5 - px, y + 0.5 - py)
                alpha = max(0, min(1, radius + 0.75 - distance))
                if alpha > 0:
                    self.composite(x, y, (*color[:3], clamp(color[3] * alpha)))

    def polygon(
        self,
        points: list[tuple[float, float]],
        color: tuple[int, int, int, int],
    ) -> None:
        min_x = math.floor(min(point[0] for point in points) - 1)
        max_x = math.ceil(max(point[0] for point in points) + 1)
        min_y = math.floor(min(point[1] for point in points) - 1)
        max_y = math.ceil(max(point[1] for point in points) + 1)

        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                inside = False
                j = len(points) - 1
                sample_x = x + 0.5
                sample_y = y + 0.5
                for i, point in enumerate(points):
                    previous = points[j]
                    intersects = (point[1] > sample_y) != (previous[1] > sample_y)
                    if intersects:
                        at_x = (previous[0] - point[0]) * (sample_y - point[1]) / (
                            previous[1] - point[1]
                        ) + point[0]
                        if sample_x < at_x:
                            inside = not inside
                    j = i
                if inside:
                    self.composite(x, y, color)

    def quadratic_bezier(
        self,
        p0: tuple[float, float],
        p1: tuple[float, float],
        p2: tuple[float, float],
        width: float,
        color: tuple[int, int, int, int],
    ) -> None:
        steps = max(16, round(math.dist(p0, p1) + math.dist(p1, p2)))
        previous = p0
        for step in range(1, steps + 1):
            t = step / steps
            x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            self.line(previous[0], previous[1], x, y, width, color)
            previous = (x, y)
        self.filled_circle(p0[0], p0[1], width / 2, color)
        self.filled_circle(p2[0], p2[1], width / 2, color)

    def stroked_circle(
        self,
        cx: float,
        cy: float,
        radius: float,
        width: float,
        color: tuple[int, int, int, int],
    ) -> None:
        half = width / 2
        min_xy = math.floor(min(cx, cy) - radius - half - 2)
        max_xy = math.ceil(max(cx, cy) + radius + half + 2)
        for y in range(min_xy, max_xy + 1):
            for x in range(min_xy, max_xy + 1):
                distance = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                edge = abs(distance - radius)
                alpha = max(0, min(1, half + 0.75 - edge))
                if alpha > 0:
                    self.composite(x, y, (*color[:3], clamp(color[3] * alpha)))

    def filled_circle(
        self,
        cx: float,
        cy: float,
        radius: float,
        color: tuple[int, int, int, int],
    ) -> None:
        min_x = math.floor(cx - radius - 2)
        max_x = math.ceil(cx + radius + 2)
        min_y = math.floor(cy - radius - 2)
        max_y = math.ceil(cy + radius + 2)
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                distance = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                alpha = max(0, min(1, radius + 0.75 - distance))
                if alpha > 0:
                    self.composite(x, y, (*color[:3], clamp(color[3] * alpha)))

    def downsample(self, target_size: int) -> list[list[tuple[int, int, int, int]]]:
        factor = self.size // target_size
        output: list[list[tuple[int, int, int, int]]] = []
        for y in range(target_size):
            row = []
            for x in range(target_size):
                totals = [0, 0, 0, 0]
                for sy in range(factor):
                    for sx in range(factor):
                        pixel = self.pixels[y * factor + sy][x * factor + sx]
                        for index in range(4):
                            totals[index] += pixel[index]
                count = factor * factor
                row.append(tuple(clamp(value / count) for value in totals))
            output.append(row)
        return output


def draw_site_logo(canvas: Canvas, scale: float = 1.0, color: tuple[int, int, int] = (224, 108, 117)) -> None:
    size = canvas.size
    logo_size = size * 0.7 * scale
    offset = (size - logo_size) / 2

    def pt(x: float, y: float) -> tuple[float, float]:
        return (offset + (x / 32) * logo_size, offset + (y / 32) * logo_size)

    coral = (*color, 255)
    soft_coral = (*color, 153)
    canvas.polygon([pt(16, 4), pt(16, 22), pt(6, 22)], coral)
    canvas.polygon([pt(16, 8), pt(16, 22), pt(24, 22)], soft_coral)
    wave_width = logo_size * (2.5 / 32)
    canvas.quadratic_bezier(pt(4, 24), pt(10, 20), pt(16, 24), wave_width, coral)
    canvas.quadratic_bezier(pt(16, 24), pt(22, 28), pt(28, 24), wave_width, coral)


def make_icon(size: int) -> list[list[tuple[int, int, int, int]]]:
    canvas = Canvas(size)
    for y in range(canvas.size):
        vertical = y / max(1, canvas.size - 1)
        base = mix((40, 44, 52), (17, 17, 17), vertical)
        for x in range(canvas.size):
            radial = math.hypot(x / canvas.size - 0.55, y / canvas.size - 0.22)
            lift = max(0, 1 - radial * 2.2)
            color = mix(base, (78, 52, 59), lift * 0.36)
            canvas.pixels[y][x] = (*color, 255)
    draw_site_logo(canvas, scale=1.06)
    return canvas.pixels


def make_transparent_mark(size: int) -> list[list[tuple[int, int, int, int]]]:
    canvas = Canvas(size)
    draw_site_logo(canvas, scale=1.08)
    return canvas.pixels


def make_favicon(size: int) -> list[list[tuple[int, int, int, int]]]:
    return make_icon(size)


def main() -> None:
    write_png(ASSET_DIR / "icon.png", make_icon(1024))
    transparent_mark = make_transparent_mark(1024)
    write_png(ASSET_DIR / "adaptive-icon.png", transparent_mark)
    write_png(ASSET_DIR / "splash-icon.png", transparent_mark)
    write_png(ASSET_DIR / "splash-icon-dark.png", transparent_mark)
    write_png(ASSET_DIR / "favicon.png", make_favicon(48))


if __name__ == "__main__":
    main()
