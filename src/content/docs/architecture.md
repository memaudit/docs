---
title: Architecture
description: How memauditd's collectors, spool, and shipping pipeline fit together, and what sampling vs zerotouch mode actually changes.
---

<!--
SPDX-FileCopyrightText: 2026 the memaudit authors
SPDX-License-Identifier: Apache-2.0
-->

## The pipeline

`memauditd` runs a set of **sources**, one per collector: host memory,
vmstat, PSI, NUMA, cgroup v2, hugepages, DAMON cold-page histograms,
and, where present, GPU memory via `nvidia-smi` and vLLM inference
metrics. Each source ticks on one of three tiers, all fixed multiples
of the config's `interval_s` (default 15s):

| Tier | Interval (at the default `interval_s: 15`) |
|---|---|
| fast | 15s |
| medium | 30s |
| slow | 60s |

Every tick, a source's collector runs and produces zero or more
records. Those records are written to the **spool**: local JSONL files
that rotate to zstd-compressed segments once they fill or age past a
timeout (60s by default), capped at `spool.max_bytes` on disk (see the
[config reference](/config-reference/#spool)). Once that cap is
exceeded, the oldest segments are dropped to make room. A warning
envelope is recorded alongside the drop so the loss shows up in the
data itself rather than only in a log line.

From there, one of two things happens, controlled by `ship.mode`:

- **`push`** (the default): a background goroutine drains spool segments
  to the `ship.url` ingest endpoint, retrying network errors and 5xx
  responses with a shared exponential backoff. A permanent failure
  (4xx) drops that segment and moves on instead of retrying forever.
  A segment is only ever removed from the spool once it has either
  shipped successfully or been permanently rejected, so a bad or
  expired `ship.token_file` (which the endpoint will reject with 401 or
  403) drops every segment it touches rather than blocking on retries.
- **`bundle`**: shipping never runs. The spool just accumulates locally,
  meant for air-gapped environments where records get collected
  manually rather than pushed anywhere.

DAMON's collector is the one stateful exception in this list: it holds
a live kernel monitoring session for its whole lifetime rather than
being purely tick-driven, and gets torn down explicitly on shutdown
rather than just stopping being ticked like every other collector.

## `sampling` vs `zerotouch` mode

`config.yaml`'s `mode` field is a label: it's logged once at startup and
isn't otherwise read by the code. The real choice is which systemd unit
you deploy (`deploy/memauditd.service` for `sampling`, or
`deploy/memauditd-zerotouch.service` for `zerotouch`). Set `mode` to
match whichever unit you actually run, so the log line reflects reality.

The two unit files differ in one functional setting: `zerotouch` adds
`ProtectKernelTunables=true`, which makes `/sys` read-only under that
unit. That has a real consequence: DAMON (the kernel subsystem
`sampling` mode's cold-page collector depends on) needs to *write* to
`/sys` to set itself up, so it can't initialize under the read-only-`/sys`
`zerotouch` unit. `zerotouch` mode is a deliberate tradeoff: a stricter,
read-only-`/sys` security posture in exchange for losing the
DAMON-based cold-page histogram entirely. This failure isn't silent:
`memauditd` logs `damon: Start failed, disabling collector` (or a
similar warning from its startup probe) and keeps running without
DAMON. If you're deploying the `zerotouch` unit deliberately, set
`collectors.damon.enabled: false` too, so you get a clean startup
instead of that warning on every run.

## What "read-only" actually means

`memauditd` reads from `/proc`, `/sys`, and `/sys/fs/cgroup` without
writing to any of them, with one deliberate exception: in `sampling`
mode, it writes to DAMON's own sysfs control files to configure and run
DAMON, since DAMON's kernel API requires it. Its own spool directory is
the only other place it writes. It never modifies application
processes, never sends signals, and never mounts, unmounts, or alters
anything about the host's filesystem layout. See the [main README's
security section](https://github.com/memaudit/memaudit#security) and
[SECURITY.md](https://github.com/memaudit/memaudit/blob/main/SECURITY.md)
for the full posture and how to report a concern.
