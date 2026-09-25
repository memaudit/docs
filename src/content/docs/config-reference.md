---
title: Config reference
description: Every memauditd config.yaml field, its type, its default, and what it does.
---

<!--
SPDX-FileCopyrightText: 2026 the memaudit authors
SPDX-License-Identifier: Apache-2.0
-->

`memauditd run` reads its config from `/etc/memaudit/config.yaml` by
default (override with `--config /path/to/file.yaml`). The file must
exist; there's no "no config, use pure defaults" mode. Start from
[`deploy/config.example.yaml`](https://github.com/memaudit/memaudit/blob/main/deploy/config.example.yaml)
in the main repo rather than writing one from scratch.

Every field below is optional: an absent field falls back to the
default shown.

## Top level

| Field | Type | Default | Meaning |
|---|---|---|---|
| `site` | string | *(none)* | A label identifying which customer/environment this host belongs to. Stamped onto every record this agent produces. Not validated at startup: if you omit it, `memauditd` still starts and every record carries an empty `site`, so treat this as effectively required in practice. |
| `interval_s` | int | `15` | Base collection interval, in seconds. Some collectors tick slower than this on fixed multiples (medium = 2x, slow = 4x); see [Architecture](/architecture/). |
| `mode` | string | `sampling` | `sampling` or `zerotouch`. Purely a label, logged at startup but not otherwise read by the code. Set it to match whichever systemd unit you actually deploy so the two stay consistent; see [Architecture](/architecture/) for what the unit choice itself changes. |

## `collectors`

### `collectors.cgroup`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `true` | Turn the cgroup v2 collector off entirely. |
| `globs` | []string | `["system.slice/*.service", "kubepods.slice/**"]` | Which cgroups (relative to `/sys/fs/cgroup`) to collect. `*` matches one path segment, `**` matches zero or more. |
| `max` | int | `500` | Caps how many cgroups get collected per interval, most-shallow-first, if more match the globs than this. |

### `collectors.damon`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `true` | Turn the DAMON cold-page collector off entirely. |
| `sample_us` | uint64 | `5000` | DAMON's sampling interval, in microseconds. |
| `aggr_us` | uint64 | `100000` | DAMON's aggregation interval, in microseconds. |
| `max_regions` | uint64 | `1000` | Caps how many memory regions DAMON tracks. |

### `collectors.nvml`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | string | `"auto"` | `"auto"` or `"true"` register the collector; they behave identically, and the name is historical. Any other value, including `"false"`, disables it. The collector runs `nvidia-smi` as a subprocess each tick. If the binary isn't found it logs a startup warning and reports nothing until it is, so it's safe to leave on `"auto"` on a host with no GPU. |

### `collectors.vllm`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `endpoints` | []string | `[]` (empty) | vLLM metrics endpoint URLs to scrape (e.g. `http://127.0.0.1:8000`). Empty means the collector has nothing to scrape and produces no records. |
| `metric_map` | map[string]string | see below | Maps memaudit's internal metric names to the actual Prometheus metric names on the scraped endpoint. |

Default `metric_map`:

```yaml
cache_usage: vllm:gpu_cache_usage_perc
prefix_hits: vllm:gpu_prefix_cache_hits_total
prefix_queries: vllm:gpu_prefix_cache_queries_total
preemptions: vllm:num_preemptions_total
running: vllm:num_requests_running
waiting: vllm:num_requests_waiting
prompt_tokens: vllm:prompt_tokens_total
gen_tokens: vllm:generation_tokens_total
```

If a new vLLM version renames these metrics, run `memauditd vllm-dump
--endpoint <url>` first. It dumps every metric name the endpoint
actually exposes, so you can update `metric_map` to match instead of
guessing.

## `k8s`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enrich` | bool | `false` | Turn on pod/namespace/label enrichment for cgroups under a `kubepods.slice` path. |
| `kubelet` | string | `https://127.0.0.1:10250` | The kubelet API URL to query for pod metadata. |
| `token_path` | string | `""` (empty) | Path to a bearer token file for kubelet auth. |
| `ca_path` | string | `""` (empty) | Path to a CA cert to verify the kubelet's TLS certificate. Ignored if `insecure_skip_verify` is set. |
| `insecure_skip_verify` | bool | `false` | Skip kubelet TLS verification entirely. Only meant for local/dev clusters using self-signed certs without a distributable CA. Never use this against a real cluster's kubelet. |
| `label_keys` | []string | `["app"]` | Which pod label keys to copy onto enriched records. |

## `spool`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dir` | string | `/var/lib/memaudit/spool` | Where collected records are written locally (JSONL, rotated to zstd) before shipping. |
| `max_bytes` | int64 | `2147483648` (2 GiB) | On-disk spool size cap. |

## `ship`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mode` | string | `push` | `push` (ship spooled segments to a remote `url` with retry/backoff) or `bundle` (never ship: air-gapped, spool stays local for manual collection). |
| `url` | string | `""` (empty) | The ingest endpoint URL. Required if `mode: push`. |
| `token_file` | string | `""` (empty) | Path to a file containing the bearer token for shipping. |

## `log`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `level` | string | `info` | Log verbosity. |

## `debug`

Off by default, never active unless deliberately turned on.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pprof_addr` | string | `""` (empty) | If set, exposes `net/http/pprof` for diagnosing a real leak or performance problem. Must be a loopback address (`127.0.0.1`, `::1`, or `localhost`) with a port; `memauditd` refuses to start rather than bind this to a non-loopback interface. |
