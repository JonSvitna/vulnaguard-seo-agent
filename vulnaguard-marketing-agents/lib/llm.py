"""
LLM Provider abstraction.
Supports Claude (Anthropic) and OpenAI with a unified interface.
Model is set per-agent in config or toggled globally from the dashboard.
"""

import os
import json
from typing import Optional
from enum import Enum

import anthropic
import openai


class LLMProvider(str, Enum):
    CLAUDE = "claude"
    OPENAI = "openai"


CLAUDE_MODELS = {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-6",
    "powerful": "claude-opus-4-6",
}

OPENAI_MODELS = {
    "fast": "gpt-4o-mini",
    "balanced": "gpt-4o",
    "powerful": "gpt-4o",
}


class LLMClient:
    """
    Unified LLM client. Pass provider and tier, get completions back.
    Usage:
        client = LLMClient(provider="claude", tier="balanced")
        response = await client.complete(system="...", user="...")
    """

    def __init__(
        self,
        provider: LLMProvider = LLMProvider.CLAUDE,
        tier: str = "balanced",
        temperature: float = 0.7,
    ):
        self.provider = provider
        self.tier = tier
        self.temperature = temperature

        if provider == LLMProvider.CLAUDE:
            self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            self.model = CLAUDE_MODELS[tier]
        else:
            self.client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
            self.model = OPENAI_MODELS[tier]

    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str:
        """Synchronous completion — returns text string."""
        if self.provider == LLMProvider.CLAUDE:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text

        else:  # OpenAI
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=self.temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return response.choices[0].message.content

    def complete_json(self, system: str, user: str, max_tokens: int = 2000) -> dict:
        """Complete and parse JSON response."""
        system_with_json = system + "\n\nRESPOND ONLY WITH VALID JSON. No preamble, no markdown fences."
        text = self.complete(system_with_json, user, max_tokens)
        # Strip any accidental fences
        text = text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(text)


def get_client(provider: Optional[str] = None, tier: str = "balanced") -> LLMClient:
    """
    Get an LLM client. Provider defaults to CLAUDE unless overridden.
    provider: 'claude' | 'openai' | None (uses env var ACTIVE_LLM_PROVIDER)
    """
    active = provider or os.environ.get("ACTIVE_LLM_PROVIDER", "claude")
    return LLMClient(provider=LLMProvider(active), tier=tier)
