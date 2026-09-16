"""Unit tests for parameter dependency ordering.

The sort takes an operation's parameter list plus a resolver that can look
up path parameters of `x-origin` source operations, and returns the list
reordered so that any parameter whose x-origin source depends on another
parameter in the same list is rendered AFTER that parameter. Stable:
parameters outside the dependency graph keep their original order.
"""

from portal_generator.builders.param_order import (
    sort_parameters_by_dependency,
)


class FakeResolver:
    """Callable-like resolver stub for tests.

    Constructed with a mapping: {(api_urn, operation_id): [path_param_names]}.
    Unknown (api, op) tuples return None to simulate an unresolvable x-origin.
    """

    def __init__(self, mapping):
        self._mapping = mapping

    def path_params_of(self, api_urn, operation_id):
        return self._mapping.get((api_urn, operation_id))


def _p(name, x_origin=None, kind="path"):
    return {
        "name": name,
        "in": kind,
        "required": True,
        "description": "",
        "schema": {"type": "string"},
        "x-origin": x_origin,
    }


def test_no_dependencies_keeps_order():
    resolver = FakeResolver({})
    params = [_p("a"), _p("b"), _p("c")]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["a", "b", "c"]


def test_single_dependency_reorders():
    # env.x-origin references access-management.listEnvironments, whose path
    # takes organizationId. So env depends on org, and org must come first.
    resolver = FakeResolver({
        ("urn:api:access-management", "listEnvironments"): ["organizationId"],
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:access-management",
        "operation": "listEnvironments",
        "values": "$.data[*].id",
    }])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["organizationId", "environmentId"]


def test_dependency_with_unrelated_params_stable():
    # foo and bar have no x-origin. env depends on org. foo and bar keep
    # their relative positions; only env moves.
    resolver = FakeResolver({
        ("urn:api:access-management", "listEnvironments"): ["organizationId"],
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:access-management",
        "operation": "listEnvironments",
        "values": "$.data[*].id",
    }])
    params = [_p("foo"), env, _p("bar"), _p("organizationId")]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["foo", "organizationId", "bar", "environmentId"]


def test_cycle_returns_input_unchanged(capsys):
    # A depends on B (via source op that lists B as path param); B depends
    # on A. Cycle. Returns input unchanged; a warning is printed.
    resolver = FakeResolver({
        ("urn:x", "opForA"): ["B"],
        ("urn:x", "opForB"): ["A"],
    })
    a = _p("A", x_origin=[{"api": "urn:x", "operation": "opForA", "values": "$"}])
    b = _p("B", x_origin=[{"api": "urn:x", "operation": "opForB", "values": "$"}])
    params = [a, b]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["A", "B"]
    captured = capsys.readouterr()
    assert "[param-order]" in captured.out
    assert "cycle" in captured.out.lower()


def test_unresolvable_x_origin_ignored():
    # x-origin points to an operation the resolver cannot find.
    # No edge is created; output equals input.
    resolver = FakeResolver({})  # no known operations
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:unknown",
        "operation": "missingOp",
        "values": "$",
    }])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["environmentId", "organizationId"]


def test_x_origin_source_path_params_only():
    # The x-origin source op resolves, but organizationId is NOT among its
    # path params (path_params_of returns []). No edge is created.
    resolver = FakeResolver({
        ("urn:api:x", "op"): [],  # source op has no path params
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:x",
        "operation": "op",
        "values": "$",
    }])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["environmentId", "organizationId"]


def test_multiple_x_origin_sources_any_can_produce_edge():
    # env has two x-origin sources. The first does not expose org as a
    # path param; the second does. The edge should still be created.
    resolver = FakeResolver({
        ("urn:api:x", "opWithoutOrg"): [],
        ("urn:api:access-management", "listEnvironments"): ["organizationId"],
    })
    env = _p("environmentId", x_origin=[
        {"api": "urn:api:x", "operation": "opWithoutOrg", "values": "$"},
        {"api": "urn:api:access-management", "operation": "listEnvironments", "values": "$"},
    ])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["organizationId", "environmentId"]


def test_x_origin_null_is_treated_as_no_source():
    # A param can have x-origin explicitly set to None (see _extract_param).
    # That must not crash.
    resolver = FakeResolver({})
    params = [_p("a", x_origin=None), _p("b", x_origin=None)]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["a", "b"]


# ---------------------------------------------------------------------------
# Additional coverage — acceptance criteria not exercised by the plan's tests.
# ---------------------------------------------------------------------------


def test_empty_params_list_returns_input():
    """Edge case guard: an empty parameter list must be a no-op and never
    reach the graph-building code.

    Covers: AC3 — the sort never introduces phantom entries or crashes on
    operations that declare zero parameters (e.g. `GET /health`).
    """
    resolver = FakeResolver({})
    out = sort_parameters_by_dependency([], resolver)
    assert out == []


def test_transitive_chain_reorders_all_ancestors_first():
    """Reordering is transitive: if A depends on B, and B depends on C,
    the output must be [C, B, A]. The plan only exercises the two-node
    org/env case; this test locks in the general topological property so
    a future refactor to a plain `.sort(key=...)` would fail here.

    Covers: AC1 — the mechanism must place *every* dependency ancestor of
    a param before that param, not just the direct parent.
    """
    resolver = FakeResolver({
        ("urn:api:x", "opForA"): ["B"],
        ("urn:api:x", "opForB"): ["C"],
    })
    a = _p("A", x_origin=[{"api": "urn:api:x", "operation": "opForA", "values": "$"}])
    b = _p("B", x_origin=[{"api": "urn:api:x", "operation": "opForB", "values": "$"}])
    c = _p("C")
    params = [a, b, c]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["C", "B", "A"]


def test_dep_name_not_in_current_params_creates_no_edge():
    """The resolver may report a path-parameter name that is NOT present in
    the current parameter list (e.g. the source op takes an unrelated ID).
    That name must not create a phantom edge, and input order must survive.

    Covers: AC3 — parameters without a detected dependency to another
    parameter in the *same list* keep their OAS order.
    """
    resolver = FakeResolver({
        ("urn:api:x", "op"): ["someUnrelatedPathParam"],
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:x",
        "operation": "op",
        "values": "$",
    }])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    assert [p["name"] for p in out] == ["environmentId", "organizationId"]


def test_self_referential_dep_is_ignored():
    """Defensive guard: if a resolver reports that a parameter's own
    x-origin source has a path parameter with the SAME name as the
    parameter itself, the sort must NOT record a P->P self-loop (which
    would deadlock Kahn's algorithm and be misclassified as a cycle).

    Covers: robustness clause in section 5 — malformed or self-referential
    x-origin metadata must not derail portal generation.
    """
    resolver = FakeResolver({
        ("urn:api:x", "opForSelf"): ["environmentId"],
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:x",
        "operation": "opForSelf",
        "values": "$",
    }])
    org = _p("organizationId")
    params = [env, org]

    out = sort_parameters_by_dependency(params, resolver)

    # A self-loop would either flip the order or trigger a "cycle detected"
    # branch. Neither is acceptable — the sort must silently drop P->P.
    assert [p["name"] for p in out] == ["environmentId", "organizationId"]


def test_stable_when_two_independent_dependency_pairs_present():
    """Two independent dependency pairs must both reorder correctly without
    interfering with each other's stability. This locks in that Kahn's
    algorithm keeps original-index ordering as the tiebreaker between
    unrelated ready nodes.

    Covers: AC1 (multiple dependencies at once) + AC3 (unrelated pairs
    keep their relative order).
    """
    resolver = FakeResolver({
        ("urn:api:x", "opForEnv"): ["organizationId"],
        ("urn:api:x", "opForFoo"): ["bar"],
    })
    env = _p("environmentId", x_origin=[{
        "api": "urn:api:x", "operation": "opForEnv", "values": "$",
    }])
    foo = _p("foo", x_origin=[{
        "api": "urn:api:x", "operation": "opForFoo", "values": "$",
    }])
    org = _p("organizationId")
    bar = _p("bar")
    params = [env, foo, org, bar]

    out = sort_parameters_by_dependency(params, resolver)

    # env must come after org; foo must come after bar. The ready nodes
    # (org, bar) preserve their original relative order (org before bar).
    names = [p["name"] for p in out]
    assert names.index("organizationId") < names.index("environmentId")
    assert names.index("bar") < names.index("foo")
