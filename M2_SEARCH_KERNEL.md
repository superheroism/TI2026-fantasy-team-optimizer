# M2 Search-Kernel Optimization

This patch follows the first M2 diagnostic run.

Observed baseline:
- 6,563 unique target boards; essentially no whole-board cache reuse.
- 89.9% prepared-role cache hit rate.
- Candidate dominance pruning was weak.
- Core+Mid pair bounds pruned 94.5% of branches.
- ~695M scenario checks; pair-bound checks alone accounted for roughly 475M (~68%).
- Candidate preparation: ~962 ms.
- Combinatorial target search: ~2,300 ms.

Changes:
1. Prefix/Core/Core+Mid optimistic bounds now stop as soon as the remaining scenarios cannot possibly beat the incumbent.
2. Pointwise-max summaries are cached by prepared candidate set, exploiting the observed ~90% prepared-role cache hit rate.
3. Surviving Core+Mid pairs materialize their 48 pair sums into one reusable scratch buffer and reuse them across all Support candidates.
4. Diagnostics split scenario checks by prefix/seed/Core/pair/triple level.
5. No approximation is introduced; the same sampled target-probability optimum and expected-score tie-break are preserved.

The next decision should be based on the new scenario-check mix and runtime.
