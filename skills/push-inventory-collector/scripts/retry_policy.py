"""Retry / expiry / stale-workspace policy copied into generated collectors."""

from __future__ import annotations

TRANSIENT_STATUS = {429, 502, 503, 504}
MAX_TRANSIENT_ATTEMPTS = 4  # initial + 3 retries
BACKOFF_SECONDS = (1, 2, 4)


def is_transient(status: int | None) -> bool:
    return status in TRANSIENT_STATUS or status in {0, None}


def should_retry_transient(status: int | None, attempt: int) -> bool:
    """attempt is 1-based. True when another try is allowed."""
    return is_transient(status) and attempt < MAX_TRANSIENT_ATTEMPTS


def backoff_seconds(attempt: int, retry_after: str | None = None) -> float:
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass
    index = min(max(attempt - 1, 0), len(BACKOFF_SECONDS) - 1)
    return float(BACKOFF_SECONDS[index])


def anypoint_401_action(*, had_successful_token: bool, already_reminted: bool) -> str:
    """Return remint, fail-auth, or fail-expired."""
    if not had_successful_token:
        return "fail-auth"
    if already_reminted:
        return "fail-expired"
    return "remint"


def classify_push_status(status: int) -> str:
    """retry | remint | stale-workspace | fail | success."""
    if status in {200, 202}:
        return "success"
    if status in TRANSIENT_STATUS:
        return "retry"
    if status == 401:
        return "remint"
    if status == 409:
        return "stale-workspace"
    return "fail"


def next_complete_after_failure(*, staged: bool, first_list_failed: bool) -> bool | None:
    """None means do not call /commit."""
    if first_list_failed and not staged:
        return None
    if staged:
        return False
    return None
