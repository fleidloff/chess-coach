# Experiment PRD 0003: Train the top pattern on your own positions

- Status: idea
- Date: 2026-10-27
- Related: the puzzle mode of the first app (commit `ac2bf49`, `src/components/Puzzles.tsx`)

## Problem

The rules tell the player what to do. They do not train it. The positions where the player went wrong are the best
training material, and the app has them already.

## Idea

A "Train this pattern" button under the rules. It opens the positions of the top tag from all 10 games, one by one,
before the blunder. The player moves a piece on the board; the app checks the move against the engine's best move and
shows the best line. The old app had this for Lichess games; its code is in git history.

## Open questions

- Accept any move within 30 cp of the best move, or only the best move?
- Does this need the analysis cache ([experiment PRD 0001](0001-analysis-cache.md)) to keep a score over days?
