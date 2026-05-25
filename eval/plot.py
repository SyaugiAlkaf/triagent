from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_rows(csv_path: Path) -> list[dict]:
    with csv_path.open() as f:
        return list(csv.DictReader(f))


def aggregate(rows: list[dict]) -> dict[str, dict[str, float]]:
    bucket: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in rows:
        bucket[(r["system"], r["chaos_mode"])].append(int(r["success"]))
    out: dict[str, dict[str, float]] = defaultdict(dict)
    for (system, chaos_mode), vals in bucket.items():
        out[chaos_mode][system] = 100.0 * sum(vals) / len(vals)
    return out


def plot(rows: list[dict], out_path: Path, title: str) -> None:
    agg = aggregate(rows)
    chaos_order = ["off", "provider_kill", "tool_kill", "combined"]
    chaos_labels = ["No chaos", "Provider kill", "Tool kill", "Combined"]
    systems = ["baseline", "resilient"]
    colors = {"baseline": "#cf5050", "resilient": "#3aa75a"}

    x = list(range(len([m for m in chaos_order if m in agg])))
    width = 0.36

    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.patch.set_facecolor("white")

    for i, system in enumerate(systems):
        ys = []
        for mode in chaos_order:
            if mode not in agg:
                continue
            ys.append(agg[mode].get(system, 0.0))
        offset = (i - 0.5) * width

        zero_floor = [2.0 if v == 0 else 0.0 for v in ys]
        if any(zero_floor):
            ax.bar(
                [xi + offset for xi in x],
                zero_floor,
                width=width,
                color="none",
                edgecolor=colors[system],
                hatch="//",
                linewidth=1.6,
                linestyle="--",
            )

        bars = ax.bar(
            [xi + offset for xi in x],
            ys,
            width=width,
            color=colors[system],
            label=system.capitalize(),
            edgecolor="white",
            linewidth=0.8,
        )
        for rect, val in zip(bars, ys):
            if val == 0:
                ax.text(
                    rect.get_x() + rect.get_width() / 2,
                    6.0,
                    "FAILED\n0%",
                    ha="center",
                    va="bottom",
                    fontsize=10,
                    color=colors[system],
                    fontweight="bold",
                )
            else:
                ax.text(
                    rect.get_x() + rect.get_width() / 2,
                    val + 1.0,
                    f"{val:.0f}%",
                    ha="center",
                    va="bottom",
                    fontsize=10,
                    color="#222",
                )

    ax.set_xticks(x)
    ax.set_xticklabels(
        [chaos_labels[chaos_order.index(m)] for m in chaos_order if m in agg],
        fontsize=11,
    )
    ax.set_ylabel("Success rate (%)", fontsize=11)
    ax.set_ylim(0, 110)
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.set_title(title, fontsize=13, pad=12)
    ax.legend(loc="upper right", frameon=False, fontsize=10)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", linestyle="--", alpha=0.25)

    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="eval/results/runs.csv")
    ap.add_argument("--out", default="eval/results/chaos_eval.png")
    ap.add_argument(
        "--title",
        default="Triagent chaos resilience: baseline vs full Triagent across 120 runs",
    )
    args = ap.parse_args()

    csv_path = _PROJECT_ROOT / args.csv
    out_path = _PROJECT_ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows = load_rows(csv_path)
    plot(rows, out_path, args.title)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
