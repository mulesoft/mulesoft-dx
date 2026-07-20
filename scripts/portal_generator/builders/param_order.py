"""Stable topological ordering of operation parameters by x-origin dependency.

Rationale: a Try It form should render dependency-parents first so users can
fill fields top-to-bottom. Example: `environmentId` has an x-origin source
whose path takes `organizationId`, so `organizationId` must render first.

Signal: for each parameter P with a non-empty `x-origin`, each source object
in `x-origin` may reference an operation whose path parameters include the
name of another parameter Q in the same list. That creates an edge P -> Q
(P depends on Q, so Q renders first).

Non-signal: query/header parameters of source operations are ignored. Only
the path parameters of the source operation count as dependencies.

Public API:
    sort_parameters_by_dependency(params, resolver) -> list[dict]

    params: list of parameter dicts as produced by _extract_param, each with
            keys {name, in, required, description, schema, x-origin}.
    resolver: object exposing
              path_params_of(api_urn: str, operation_id: str) -> list[str] | None
              Returns None (or empty list) when the source cannot be resolved.

Behavior:
    - Stable: parameters outside the dependency graph keep their original
      relative order.
    - Safe on cycles: logs a warning to stdout and returns the input list
      unchanged.
    - Safe on unresolvable x-origin: silently drops the offending edge.
"""

from collections import defaultdict
from typing import List, Dict, Any, Protocol, Optional


class OperationResolver(Protocol):
    def path_params_of(
        self, api_urn: str, operation_id: str
    ) -> Optional[List[str]]: ...


def sort_parameters_by_dependency(
    params: List[Dict[str, Any]],
    resolver: OperationResolver,
) -> List[Dict[str, Any]]:
    if not params:
        return params

    # Fast path: no x-origin anywhere -> nothing to reorder.
    if not any(p.get("x-origin") for p in params):
        return params

    name_to_index = {p.get("name", ""): i for i, p in enumerate(params)}

    # Build edges P -> Q where P depends on Q. Use a set of (P, Q) tuples so
    # duplicate edges (same dep from multiple x-origin sources) do not skew
    # the in-degree count.
    edges = set()
    for p in params:
        p_name = p.get("name", "")
        sources = p.get("x-origin") or []
        if not isinstance(sources, list):
            continue
        for src in sources:
            if not isinstance(src, dict):
                continue
            api_urn = src.get("api")
            op_id = src.get("operation")
            if not api_urn or not op_id:
                continue
            dep_names = resolver.path_params_of(api_urn, op_id) or []
            for dep in dep_names:
                if dep in name_to_index and dep != p_name:
                    edges.add((p_name, dep))

    if not edges:
        return params

    # Only parameters that participate in at least one edge (as dependent OR
    # dependency) are "involved". Everything else keeps its original position.
    # This preserves stability for unrelated params (they neither move nor
    # yield their slot).
    involved_names = set()
    for p_name, dep in edges:
        involved_names.add(p_name)
        involved_names.add(dep)

    # Reserved slots: the input positions of the involved parameters.
    reserved_slots = sorted(name_to_index[n] for n in involved_names)

    # Kahn's algorithm over the involved subgraph with stable ordering.
    # A node is emitted only after every node it depends on has been emitted.
    # When multiple nodes are ready, the one with the smaller original index
    # wins (input order tiebreak).
    dependents_of = defaultdict(set)   # Q -> {P, ...} (nodes that depend on Q)
    remaining_deps = defaultdict(int)  # P -> count of unmet dependencies
    for p_name, dep in edges:
        dependents_of[dep].add(p_name)
        remaining_deps[p_name] += 1

    ready = sorted(
        [n for n in involved_names if remaining_deps[n] == 0],
        key=lambda n: name_to_index[n],
    )

    emitted_order = []
    emitted_set = set()
    while ready:
        node = ready.pop(0)
        if node in emitted_set:
            continue
        emitted_set.add(node)
        emitted_order.append(node)
        newly_ready = []
        for dependent in dependents_of.get(node, ()):
            remaining_deps[dependent] -= 1
            if remaining_deps[dependent] == 0:
                newly_ready.append(dependent)
        # Preserve stability: insertion into `ready` keeps original OAS
        # order among nodes that become ready at the same time.
        for n in sorted(newly_ready, key=lambda x: name_to_index[x]):
            ready.append(n)

    if len(emitted_order) != len(involved_names):
        cycle_nodes = sorted(
            n for n in involved_names if n not in emitted_set
        )
        print(
            f"[param-order] cycle detected among parameters "
            f"{cycle_nodes}; returning input order unchanged"
        )
        return params

    by_name = {p.get("name", ""): p for p in params}

    # Reconstruct output: keep uninvolved params in their original slots,
    # and fill the reserved slots with the topo-sorted involved params.
    result = list(params)
    for slot, emitted_name in zip(reserved_slots, emitted_order):
        result[slot] = by_name[emitted_name]
    return result
