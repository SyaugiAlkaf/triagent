from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from app.gateway import CompletionResult, Message, Provider


_DEFAULT_CACHE = Path(__file__).resolve().parent.parent / "demo" / "responses_cache.json"


def _digest(messages: list[Message]) -> str:
    blob = "\n".join(f"{m.role}:{m.content}" for m in messages)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


class ResponseCache:
    """Disk-backed map of message-hash to canned CompletionResult dicts."""

    def __init__(self, path: Path | None = None):
        self.path = path or _DEFAULT_CACHE
        self.data: dict[str, dict] = {}
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text())
            except Exception:
                self.data = {}

    def __contains__(self, key: str) -> bool:
        return key in self.data

    def get(self, key: str) -> dict | None:
        return self.data.get(key)

    def put(self, key: str, payload: dict) -> None:
        self.data[key] = payload

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True))


class CachedProvider:
    """Wraps a real provider: hit cache by message-hash, fall through to provider on miss."""

    def __init__(self, inner: Provider, cache: ResponseCache, write_through: bool = False):
        self.inner = inner
        self.cache = cache
        self.write_through = write_through
        self.name = f"cached-{inner.name}"
        self.model = inner.model

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        key = _digest(messages)
        hit = self.cache.get(key)
        if hit is not None:
            return CompletionResult(
                provider=hit.get("provider", self.inner.name),
                model=hit.get("model", self.inner.model),
                text=hit["text"],
                latency_ms=0.5,
                input_tokens=hit.get("input_tokens", 0),
                output_tokens=hit.get("output_tokens", 0),
            )
        result = self.inner.complete(messages, **kwargs)
        if self.write_through:
            self.cache.put(
                key,
                {
                    "provider": result.provider,
                    "model": result.model,
                    "text": result.text,
                    "input_tokens": result.input_tokens,
                    "output_tokens": result.output_tokens,
                    "captured_at": time.time(),
                },
            )
            self.cache.save()
        return result


def use_cache_enabled() -> bool:
    return os.environ.get("USE_CACHE", "false").lower() in {"1", "true", "yes"}


def write_cache_enabled() -> bool:
    return os.environ.get("CAPTURE_CACHE", "false").lower() in {"1", "true", "yes"}
