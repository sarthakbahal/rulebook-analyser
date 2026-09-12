"""
eval.py — CLI Benchmark Runner
===============================
Runs the 43-question test set against the RegulationEngine and reports
accuracy metrics (overall, answerable, near_miss, contradiction) using
a Rich terminal table.

Usage:
    python eval.py

Output:
    Pretty-printed table + summary metrics in terminal.
    Results saved to eval_results.json.
"""

import json
import logging
import time
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.table import Table
from rich import box

from ingest import IngestionPipeline
from engine import RegulationEngine

load_dotenv()
logging.basicConfig(level=logging.WARNING)

console = Console()


def run_evaluation(
    test_set_path: str = "test_set.json",
    pdf_path: str = "corpus/academic_handbook.pdf",
    md_files: list[str] | None = None,
) -> dict:
    """
    Run the full 43-question benchmark.
    Returns a dict with 'metrics' and 'results' keys.
    """
    if md_files is None:
        md_files = ["corpus/hostel_rules.md", "corpus/fee_deadlines.md"]

    # ── Load test set ──────────────────────────────────────────────
    with open(test_set_path, encoding="utf-8") as f:
        test_data = json.load(f)
    questions = test_data["questions"]
    counts = test_data["counts"]

    console.rule("[bold blue]Rulebook Engine — Evaluation Benchmark[/bold blue]")
    console.print(f"Loaded [cyan]{len(questions)}[/cyan] questions: "
                  f"[green]{counts['answerable']} answerable[/green] · "
                  f"[yellow]{counts['near_miss']} near-miss[/yellow] · "
                  f"[red]{counts['contradiction']} contradiction[/red]\n")

    # ── Initialize pipeline & engine ──────────────────────────────
    console.print("[dim]Initialising ingestion pipeline…[/dim]")
    pipeline = IngestionPipeline(pdf_path=pdf_path, md_files=md_files)
    pipeline.build_index()
    engine = RegulationEngine(pipeline)
    console.print("[dim]Engine ready.\n[/dim]")

    # ── Run evaluation ─────────────────────────────────────────────
    metrics: dict[str, dict] = {
        "overall": {"correct": 0, "total": len(questions)},
        "answerable": {"correct": 0, "total": counts["answerable"]},
        "near_miss": {"correct": 0, "total": counts["near_miss"]},
        "contradiction": {"correct": 0, "total": counts["contradiction"]},
    }
    results: list[dict] = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Running queries…", total=len(questions))

        for q in questions:
            predicted = engine.query(q["question"])
            match = predicted.state == q["type"]

            if match:
                metrics["overall"]["correct"] += 1
                metrics[q["type"]]["correct"] += 1

            results.append(
                {
                    "id": q["id"],
                    "type": q["type"],
                    "question": q["question"],
                    "predicted_state": predicted.state,
                    "match": match,
                    "answer": predicted.answer,
                    "confidence": predicted.confidence_score,
                }
            )
            progress.advance(task)
            time.sleep(2.0)  # keep the request rate below Groq TPM limits

    # ── Print results table ────────────────────────────────────────
    table = Table(
        title="Per-Question Results",
        box=box.ROUNDED,
        show_lines=False,
        header_style="bold blue",
    )
    table.add_column("ID", style="cyan", width=5)
    table.add_column("Expected", style="yellow", width=14)
    table.add_column("Predicted", style="yellow", width=14)
    table.add_column("Conf.", justify="right", width=6)
    table.add_column("Status", justify="center", width=8)
    table.add_column("Question (truncated)", no_wrap=True)

    for r in results:
        status = "[bold green]PASS[/bold green]" if r["match"] else "[bold red]FAIL[/bold red]"
        conf_str = f"{r['confidence']:.2f}"
        question_short = (r["question"][:60] + "…") if len(r["question"]) > 60 else r["question"]
        table.add_row(
            r["id"],
            r["type"],
            r["predicted_state"],
            conf_str,
            status,
            question_short,
        )

    console.print(table)

    # ── Print summary ──────────────────────────────────────────────
    console.rule("[bold]Summary[/bold]")
    label_styles = {
        "overall": "bold white",
        "answerable": "bold green",
        "near_miss": "bold yellow",
        "contradiction": "bold red",
    }
    for key in ["overall", "answerable", "near_miss", "contradiction"]:
        m = metrics[key]
        pct = (m["correct"] / m["total"]) * 100 if m["total"] > 0 else 0.0
        bar = "█" * int(pct // 5) + "░" * (20 - int(pct // 5))
        console.print(
            f"[{label_styles[key]}]{key.upper():>14}[/{label_styles[key]}]  "
            f"{bar}  {m['correct']}/{m['total']}  ({pct:.1f}%)"
        )

    # ── Save results ───────────────────────────────────────────────
    output = {"metrics": metrics, "results": results}
    out_path = Path("eval_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    console.print(f"\n[dim]Results saved to [cyan]{out_path}[/cyan][/dim]")

    return output


if __name__ == "__main__":
    run_evaluation()
