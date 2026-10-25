"""`.env.example` is the first file a new developer copies: it must load, and must never enable the admin endpoint."""

import re
from pathlib import Path

from app.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[3] / ".env.example"


def test_env_example_loads_with_safe_defaults() -> None:
    s = Settings(_env_file=ENV_EXAMPLE)  # type: ignore[call-arg]
    assert s.app_env == "production"
    assert not s.admin_token, "the placeholder must leave POST /api/admin/refresh disabled"
    assert s.decision_cutoff_local == "09:20" and s.analysis_month == "2026-01"
    assert s.auto_ingest_on_start is False


def test_env_example_has_no_inline_comments_after_values() -> None:
    """Compose treats `KEY=  # comment` as KEY='# comment' (and python-dotenv differs): keep comments on their own line."""
    for line in ENV_EXAMPLE.read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            value = stripped.split("=", 1)[1]
            assert "#" not in value, (
                f"inline comment after a value would be parsed inconsistently: {line!r}"
            )


def test_env_example_contains_placeholders_only() -> None:
    text = ENV_EXAMPLE.read_text().lower()
    for needle in ("password", "secret=", "apikey", "api_key", "token=ey", "bearer "):
        assert needle not in text


# Read by docker-compose.yml only (host port mappings), never by the application.
COMPOSE_ONLY = {"API_PORT", "WEB_PORT"}


def _example_keys() -> set[str]:
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", ENV_EXAMPLE.read_text(), flags=re.MULTILINE))


def test_every_setting_in_code_is_documented_in_env_example() -> None:
    """A setting that exists but is not in .env.example is invisible to anyone configuring a deployment."""
    undocumented = {name.upper() for name in Settings.model_fields} - _example_keys()
    assert not undocumented, f"add to .env.example: {sorted(undocumented)}"


def test_env_example_does_not_document_settings_that_do_not_exist() -> None:
    """A documented variable that the code ignores would silently do nothing."""
    unknown = _example_keys() - {name.upper() for name in Settings.model_fields} - COMPOSE_ONLY
    assert not unknown, f"not a Settings field (typo or removed?): {sorted(unknown)}"
