"""Environment-backed configuration for Charlie-Agent.

Loads `.env` if present. All secret values stay in the environment —
never hard-code credentials in source.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. See `.env.example` for the full list."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM — OpenAI-compatible chat completions (works with xAI api.x.ai)
    xai_api_key: str = Field(default="", alias="XAI_API_KEY")
    llm_base_url: str = Field(default="https://api.x.ai/v1", alias="LLM_BASE_URL")
    llm_model: str = Field(default="grok-4.7", alias="LLM_MODEL")
    llm_max_tool_iterations: int = Field(default=6, alias="LLM_MAX_TOOL_ITERATIONS")

    # Twilio
    twilio_account_sid: str = Field(default="", alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field(default="", alias="TWILIO_AUTH_TOKEN")
    twilio_phone_number: str = Field(default="", alias="TWILIO_PHONE_NUMBER")
    public_base_url: str = Field(default="http://localhost:8000", alias="PUBLIC_BASE_URL")

    # Tools
    search_backend: str = Field(default="stub", alias="SEARCH_BACKEND")
    http_allowlist: str = Field(default="example.com,api.github.com", alias="HTTP_ALLOWLIST")

    # Memory
    memory_dir: Path = Field(default=Path("./data/memory"), alias="MEMORY_DIR")

    @property
    def http_allowlist_hosts(self) -> set[str]:
        return {h.strip().lower() for h in self.http_allowlist.split(",") if h.strip()}

    @property
    def has_llm_key(self) -> bool:
        return bool(self.xai_api_key and self.xai_api_key.strip())

    @property
    def has_twilio(self) -> bool:
        return bool(
            self.twilio_account_sid
            and self.twilio_auth_token
            and self.twilio_phone_number
            and not self.twilio_account_sid.startswith("ACxxxx")
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
