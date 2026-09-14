import pytest

from setout.config import Settings
from setout.services.auth import delay_for

pytestmark = pytest.mark.unit


def _settings(**over: object) -> Settings:
    base: dict[str, object] = {
        "login_free_attempts": 3,
        "login_delay_seconds": 1.0,
        "login_delay_cap_seconds": 8.0,
        "login_max_attempts": 7,
    }
    return Settings(**(base | over))  # type: ignore[arg-type]


@pytest.mark.parametrize("failures", [0, 1, 2])
def test_the_first_few_attempts_are_answered_at_once(failures: int) -> None:
    assert delay_for(failures, _settings()) == 0.0


@pytest.mark.parametrize(("failures", "wait"), [(3, 1.0), (4, 2.0), (5, 4.0), (6, 8.0)])
def test_the_wait_doubles_once_the_free_attempts_are_spent(failures: int, wait: float) -> None:
    assert delay_for(failures, _settings()) == wait


def test_the_attempt_is_refused_once_there_have_been_too_many() -> None:
    assert delay_for(7, _settings()) is None
    assert delay_for(70, _settings()) is None


def test_the_wait_never_grows_past_the_cap() -> None:
    settings = _settings(login_delay_cap_seconds=2.0, login_max_attempts=99)
    assert delay_for(4, settings) == 2.0
    assert delay_for(20, settings) == 2.0


def test_a_zero_delay_leaves_the_ceiling_where_it_is() -> None:
    # The suite runs with no waiting, which must not also turn off the refusal.
    settings = _settings(login_delay_seconds=0.0)
    assert delay_for(5, settings) == 0.0
    assert delay_for(7, settings) is None
