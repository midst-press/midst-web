#!/usr/bin/env python3
"""Check and summarise a Playwright JSON report of the @frame-budget tests.

Usage: frame_budget_report.py REPORT.json EXPECTED_TESTS REPEATS OUT.md

Fails (exit 1) unless exactly EXPECTED_TESTS distinct tests ran, each REPEATS times, every run passed, and
every run printed its measurement line. So a filter that matches nothing, a skipped test or a retried
pass cannot read as green. OUT.md gets the animation-frame and sampler interval figures per run and
across runs; it is posted on the pull request because job logs here are not readable by reviewers.
"""
import json
import statistics
import sys


def runs(suite):
    for spec in suite.get("specs", []):
        for test in spec.get("tests", []):
            for result in test.get("results", []):
                yield spec["title"], result
    for child in suite.get("suites", []):
        yield from runs(child)


def measurement(result):
    for entry in result.get("stdout", []):
        for line in entry.get("text", "").splitlines():
            if line.startswith('{"follow"'):
                return json.loads(line)
    return None


def main():
    report_path, expected, repeats, out_path = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    report = json.load(open(report_path))
    rows, problems = [], []
    for title, result in (pair for suite in report.get("suites", []) for pair in runs(suite)):
        m = measurement(result)
        rows.append((title, result.get("status"), result.get("retry", 0), m))
        if result.get("status") != "passed":
            problems.append(f"{title}: {result.get('status')}")
        if m is None:
            problems.append(f"{title}: no measurement line")
    titles = {r[0] for r in rows}
    if len(titles) != expected:
        problems.append(f"{len(titles)} distinct tests ran, expected {expected}")
    if len(rows) != expected * repeats:
        problems.append(f"{len(rows)} test runs, expected {expected * repeats}")
    lines = ["| test | status | rAF median ms | rAF max ms | sampler median ms | sampler max ms |", "|---|---|---|---|---|---|"]
    raf_med, raf_max, s_med, s_max = [], [], [], []
    for title, status, _retry, m in rows:
        if m is None:
            lines.append(f"| {title} | {status} | - | - | - | - |")
            continue
        raf, sampler = m["raf"], m["sampler"]
        fmt = lambda v: "-" if v is None else f"{v:.1f}"  # noqa: E731
        lines.append(f"| {title} | {status} | {fmt(raf['medianMs'])} | {fmt(raf['maxMs'])} | {fmt(sampler['medianMs'])} | {fmt(sampler['maxMs'])} |")
        for store, value in ((raf_med, raf["medianMs"]), (raf_max, raf["maxMs"]), (s_med, sampler["medianMs"]), (s_max, sampler["maxMs"])):
            if value is not None:
                store.append(value)
    summary = []
    for name, values in (("rAF interval, per-run median", raf_med), ("rAF interval, per-run max", raf_max),
                         ("sampler interval, per-run median", s_med), ("sampler interval, per-run max", s_max)):
        if values:
            summary.append(f"- {name}: median {statistics.median(values):.1f} ms, max {max(values):.1f} ms over {len(values)} runs")
    verdict = "FAILED: " + "; ".join(problems) if problems else f"passed: {len(titles)} tests x {repeats} runs"
    text = f"**frame-budget on the Linux runner: {verdict}**\n\n" + "\n".join(summary) + "\n\n" + "\n".join(lines) + "\n"
    open(out_path, "w").write(text)
    print(text)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
