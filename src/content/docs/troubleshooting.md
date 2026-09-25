---
title: Troubleshooting
description: What each memauditd selftest check means, and the real kernel/environment edge cases you might hit.
---

<!--
SPDX-FileCopyrightText: 2026 the memaudit authors
SPDX-License-Identifier: Apache-2.0
-->

Run `memauditd selftest` before deploying anywhere new. It inspects the
host and reports a capability matrix without collecting anything
itself, so it's safe to run anywhere, anytime.

## Reading the output

Each line is one check, `OK` or `FAIL: <detail>`, followed by a final
one-line verdict. Only **one** check failing makes `selftest` exit
non-zero and means no useful audit is possible at all:

- **`host memory (/proc/meminfo)`**: every collector and every
  degraded-mode fallback assumes this file is readable. If this fails,
  nothing else on the host matters; something more fundamental than
  memaudit is wrong (`/proc` not mounted, running in an unusually
  locked-down container, etc.).

Every other check failing just narrows which fallback applies; the
agent still runs in a degraded but useful mode:

- **`kernel <version>`**: shows `OK` with the detected kernel version
  when `/proc/sys/kernel/osrelease` is readable (later checks reference
  the kernel version's implications). It can still fail on a host where
  that file itself isn't readable, which is as unusual as the host
  memory check failing.
- **`cgroup v2 unified`**: `FAIL: cgroup v1 host — host-level cgroup
  metrics only` means this host uses the legacy cgroup v1 hierarchy.
  memaudit still runs, but per-cgroup breakdowns become host-level
  aggregates only.
- **`DAMON sysfs`**, **`DAMON paddr`**, **`DAMON tried_regions
  (>=6.2)`**: the three capability rungs DAMON needs, checked
  separately. Any of these failing shows `FAIL: DAMON unavailable —
  cold-page estimate not computed` (for `sysfs`/`paddr`), meaning the
  cold-page histogram won't be produced on this host at all; every
  other collector still works normally. If DAMON capability detection
  itself errors (rather than just finding a capability missing), all
  three rows show that raw error text instead.
- **`DAMON tried_regions (>=6.2)`** specifically has a different detail
  message when it fails: *"kernel version suggests no full histogram
  mode; this check relies on the version string alone and can miss
  backported support (seen on RHEL-family kernels) — the agent confirms
  real availability at startup."* This is a known limitation of the
  check itself, not necessarily the host: some RHEL-family kernels
  backport `tried_regions` support onto an older-looking version
  string, which this static version check can't detect. `memauditd`
  probes for the real capability at startup regardless of what this
  line says, so a `FAIL` here doesn't guarantee the feature is actually
  missing. Don't treat this line as final; check the agent's own
  startup log on a host where this matters.
- **`PSI`**: `FAIL: PSI unavailable — stranded estimate not computed`
  means this kernel wasn't built with PSI (`CONFIG_PSI`) accounting.
  The stranded-DRAM estimate that depends on PSI's memory-pressure
  signal won't be computed; every other collector still works. A kernel
  can also have PSI compiled in but disabled at boot
  (`CONFIG_PSI_DEFAULT_DISABLED`, common on hardened or distro
  kernels); if that's the case, adding `psi=1` to the kernel command
  line re-enables it without a rebuild.

## Known kernel/environment edge cases

These are real, previously-hit scenarios worth knowing about
specifically, not just abstractly covered by the checks above:

- **A host with no NUMA sysfs at all** (single-node VMs, some
  containers): the NUMA collector returns an empty result, not an
  error. Expected, not a bug.
- **A host with no hugepages sysfs at all** (`CONFIG_HUGETLB` off, or a
  container without `/sys/kernel/mm` exposed): same, empty result, not
  an error.
- **An old kernel reporting combined `workingset_refault` /
  `workingset_activate` counters** instead of the `_anon`/`_file` split
  memaudit stores (pre-5.8 kernels): those two unsplit keys are ignored
  (left zero), not treated as an error.
- **Reading `/proc/iomem` as a non-root user**: every address range
  reads back masked to `00000000-00000000` with labels intact, rather
  than the real addresses. memaudit's own iomem parser detects this
  exact all-zero pattern and reports it as an explicit "requires root"
  condition rather than silently treating a masked range as a real
  zero-sized one.
- **A cgroup v1 host**: see the `cgroup v2 unified` check above; this
  is a real, supported degraded mode, not an error state.
- **DAMON entirely absent, pre-6.2, or a RHEL-family backport**: three
  distinct real scenarios this project tests against directly (kernel
  builds without `CONFIG_DAMON` at all, kernels below DAMON's
  `tried_regions` histogram floor, and RHEL-family kernels that
  backport `tried_regions` onto an older-looking version string). See
  the `DAMON tried_regions` note above for how memaudit actually
  handles the third case despite what the static version check alone
  would suggest.

## Still stuck?

Open an issue on [github.com/memaudit/memaudit](https://github.com/memaudit/memaudit/issues)
with your full `memauditd selftest` output and kernel version
(`uname -r`). If the issue involves a security concern (e.g. a
privilege escalation path, not just a missing feature), see
[SECURITY.md](https://github.com/memaudit/memaudit/blob/main/SECURITY.md)
instead of opening a public issue.
