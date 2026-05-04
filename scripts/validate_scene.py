#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any


TOLERANCE = 0.08


def wall_length(wall: dict[str, Any], nodes: dict[str, tuple[float, float]] | None = None) -> float:
    start, end = wall_points(wall, nodes)
    return math.hypot(end[0] - start[0], end[1] - start[1])


def wall_points(wall: dict[str, Any], nodes: dict[str, tuple[float, float]] | None = None) -> tuple[tuple[float, float], tuple[float, float]]:
    if nodes and "startNodeId" in wall:
        return nodes[wall["startNodeId"]], nodes[wall["endNodeId"]]
    return tuple(wall["start"]), tuple(wall["end"])  # type: ignore[return-value]


def point_key(point: tuple[float, float]) -> tuple[int, int]:
    return round(point[0] / TOLERANCE), round(point[1] / TOLERANCE)


def segment_key(start: tuple[float, float], end: tuple[float, float]) -> tuple[tuple[int, int], tuple[int, int]]:
    a = point_key(start)
    b = point_key(end)
    return tuple(sorted((a, b)))  # type: ignore[return-value]


def point_on_line(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> bool:
    dx = end[0] - start[0]
    dz = end[1] - start[1]
    return abs((point[0] - start[0]) * dz - (point[1] - start[1]) * dx) <= TOLERANCE


def project(start: tuple[float, float], end: tuple[float, float], point: tuple[float, float]) -> float:
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    if length == 0:
        return 0
    dx = (end[0] - start[0]) / length
    dz = (end[1] - start[1]) / length
    return (point[0] - start[0]) * dx + (point[1] - start[1]) * dz


def collinear_overlap(a: dict[str, Any], b: dict[str, Any], nodes: dict[str, tuple[float, float]]) -> float:
    a_start, a_end = wall_points(a, nodes)
    b_start, b_end = wall_points(b, nodes)
    if not point_on_line(b_start, a_start, a_end) or not point_on_line(b_end, a_start, a_end):
        return 0
    length = wall_length(a, nodes)
    b0 = max(0, min(length, project(a_start, a_end, b_start)))
    b1 = max(0, min(length, project(a_start, a_end, b_end)))
    return max(0, min(length, max(b0, b1)) - max(0, min(b0, b1)))


def diagnose(scene: dict[str, Any]) -> dict[str, list[str]]:
    graph = scene.get("wallGraph")
    if graph:
        nodes = {node["id"]: tuple(node["point"]) for node in graph["nodes"]}
        walls = graph["walls"]
    else:
        nodes = {}
        walls = scene.get("wallSegments", [])

    diagnostics: dict[str, list[str]] = {
        "duplicateWalls": [],
        "danglingNodes": [],
        "overlappingWalls": [],
        "openingErrors": [],
        "missingRoomRefs": [],
    }

    room_ids = {room["id"] for room in scene.get("rooms", [])}
    wall_keys: dict[tuple[tuple[int, int], tuple[int, int]], str] = {}
    degrees: dict[str, int] = defaultdict(int)

    for wall in walls:
        start, end = wall_points(wall, nodes)
        key = segment_key(start, end)
        if key in wall_keys:
            diagnostics["duplicateWalls"].append(f"{wall_keys[key]} / {wall['id']}")
        wall_keys[key] = wall["id"]
        if graph:
            degrees[wall["startNodeId"]] += 1
            degrees[wall["endNodeId"]] += 1
        for room_id in wall.get("roomIds", []):
            if room_id not in room_ids:
                diagnostics["missingRoomRefs"].append(f"{wall['id']}: {room_id}")

    if graph:
        for node in graph["nodes"]:
            if degrees[node["id"]] <= 1:
                diagnostics["danglingNodes"].append(node["id"])

    for index, wall in enumerate(walls):
        for other in walls[index + 1:]:
            start, end = wall_points(wall, nodes)
            other_start, other_end = wall_points(other, nodes)
            if segment_key(start, end) == segment_key(other_start, other_end):
                continue
            if collinear_overlap(wall, other, nodes) > TOLERANCE:
                diagnostics["overlappingWalls"].append(f"{wall['id']} / {other['id']}")

    wall_by_id = {wall["id"]: wall for wall in walls}
    for opening in scene.get("wallOpenings", []):
        wall = wall_by_id.get(opening["wallId"])
        if not wall:
            diagnostics["openingErrors"].append(f"{opening['id']}: missing wall {opening['wallId']}")
            continue
        length = wall_length(wall, nodes)
        height = wall.get("height") or scene.get("defaultHeight") or 2.8
        if opening["center"] - opening["width"] / 2 < -TOLERANCE or opening["center"] + opening["width"] / 2 > length + TOLERANCE:
            diagnostics["openingErrors"].append(f"{opening['id']}: outside {opening['wallId']}")
        if opening["sillHeight"] + opening["height"] > height + TOLERANCE:
            diagnostics["openingErrors"].append(f"{opening['id']}: taller than {opening['wallId']}")

    return diagnostics


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate hard-renovation scene wall topology.")
    parser.add_argument("scene", type=Path, help="Path to scene.json")
    args = parser.parse_args()
    scene = json.loads(args.scene.read_text())
    diagnostics = diagnose(scene)
    print(json.dumps(diagnostics, indent=2, ensure_ascii=False))
    if any(diagnostics.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
