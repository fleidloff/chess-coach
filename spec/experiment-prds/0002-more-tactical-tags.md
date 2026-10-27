# Experiment PRD 0002: Tags for the blunders that stay untagged

- Status: idea
- Date: 2026-10-27

## Problem

The six tags of PRD 0001 cover only part of the blunders. The rest read "Tactical error. Best was …". In the first
test with `thibault`, the top error of the latest game had no tag. An untagged blunder never counts as a pattern.

## Idea

Measure first: log the share of untagged blunders over many games. Then add the most frequent missing patterns, for
example:

- `ALLOWED_FORK`: the engine's reply forks two of the mover's pieces.
- `MISSED_MATE` / `ALLOWED_MATE`: a mate score appears or disappears. Needs a rule apart from the ±1000 clamp
  ([ADR 0003](../adrs/0003-centipawn-loss-and-blunder-rule.md)).
- `DISCOVERED_ATTACK`: the reply moves a piece and opens a line to a bigger target.
- `MISSED_CAPTURE`: the best move takes a free piece.

Each new tag needs a label, a summary template, two rules and a FEN test.

## Open questions

- Which share of untagged blunders is good enough? (Suggestion: under 30 %.)
