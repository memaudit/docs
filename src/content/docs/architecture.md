---
title: Architecture
description: How memauditd's collectors, spool, and shipping pipeline fit together, and what sampling vs zerotouch mode actually changes.
---

<!--
SPDX-FileCopyrightText: 2026 the memaudit authors
SPDX-License-Identifier: Apache-2.0
-->

## The pipeline

`memauditd` runs a set of **sources** — one per collector (host memory,
vmstat, PSI, NUMA, cgroup v2, hugepages, DAMON cold-page histograms,
and, where present, GPU memory via `nvidia-smi` and vLLM inference
metrics). Each source ticks on one of three tiers, all fixed multiples
of the config's `interval_s` (default 15s):

| Tier | Interval (at the default `interval_s: 15`) |
|---|---|
| fast | 15s |
| medium | 30s |
| slow | 60s |

Every tick, a source's collector runs and produces zero or more
records. Those records are written to the **spool**: local JSONL files,
rotated to zstd-compressed segments as they fill, capped at
`spool.max_bytes` on disk (see the [config reference](/config-reference/#spool)).
Once that cap is exceeded, the oldest segments are dropped to make room
— a warning envelope is recorded alongside the drop so the loss shows up
in the data itself rather than only in a log line.

From there, one of two things happens, controlled by `ship.mode`:

- **`push`** (the default): a background process drains spool segments
  to the `ship.url` ingest endpoint, retrying network errors and 5xx
  responses with a shared exponential backoff. A permanent failure
  (4xx) drops that segment and moves on rather than retrying forever —
  a segment is only ever removed from the spool once it has either
  shipped successfully or been permanently rejected.
- **`bundle`**: shipping never runs. The spool just accumulates locally
  — meant for air-gapped environments where records get collected
  manually rather than pushed anywhere.

DAMON's collector is the one stateful exception in this list: it holds
a live kernel monitoring session for its whole lifetime rather than
being purely tick-driven, and gets torn down explicitly on shutdown
rather than just stopping being ticked like every other collector.

## `sampling` vs `zerotouch` mode

`config.yaml`'s `mode` field doesn't change what's *in* the config file
beyond that one field — it changes which systemd unit you deploy
(`deploy/memauditd.service` for `sampling`, or
`deploy/memauditd-zerotouch.service` for `zerotouch`). The two unit
files differ by exactly one line: `zerotouch` sets
`ProtectKernelTunables=true`, which makes `/sys` read-only under that
unit.

That one line has a real consequence: DAMON (the kernel subsystem
`sampling` mode's cold-page collector depends on) needs to *write* to
`/sys` to set itself up. Under the read-only-`/sys` `zerotouch` unit,
DAMON can't initialize — so `zerotouch` mode is a deliberate tradeoff:
a stricter, read-only-`/sys` security posture, in exchange for losing
the DAMON-based cold-page histogram entirely. Pick `zerotouch` only
when `config.yaml` also has `mode: zerotouch` set to match — running
the `zerotouch` unit against a `sampling`-mode config just means DAMON
silently never comes up.

## What "read-only" actually means

`memauditd` never writes to any of the filesystems it reads from
(`/proc`, `/sys`, `/sys/fs/cgroup`) — it only reads memory/counter
files and, in `sampling` mode, writes to DAMON's own sysfs control
files to configure and run DAMON itself (the one deliberate exception,
since DAMON's kernel API requires it). It never modifies application
processes, never sends signals, and never mounts, unmounts, or alters
anything about the host's filesystem layout. See the [main README's
security section](https://github.com/memaudit/memaudit#security) and
[SECURITY.md](https://github.com/memaudit/memaudit/blob/main/SECURITY.md)
for the full posture and how to report a concern.
