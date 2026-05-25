from __future__ import annotations

import os
import time
from typing import Any, Protocol

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str
    content: str


class CompletionResult(BaseModel):
    provider: str
    model: str
    text: str
    latency_ms: float
    input_tokens: int = 0
    output_tokens: int = 0


class TraceEvent(BaseModel):
    kind: str
    provider: str | None = None
    model: str | None = None
    latency_ms: float | None = None
    detail: str = ""
    timestamp: float = Field(default_factory=time.time)


class ProviderError(RuntimeError):
    pass


class BudgetExceeded(RuntimeError):
    pass


_PROVIDER_RATES_USD_PER_M_TOK = {
    "tf-primary": {"in": 0.59, "out": 0.79},
    "tf-verify": {"in": 0.0, "out": 0.0},
    "tf-tertiary": {"in": 0.0, "out": 0.0},
    "groq": {"in": 0.59, "out": 0.79},
    "ollama": {"in": 0.0, "out": 0.0},
    "mock": {"in": 0.0, "out": 0.0},
    "truefoundry": {"in": 0.15, "out": 0.60},
}


def estimate_cost_usd(provider: str, input_tokens: int, output_tokens: int) -> float:
    rates = _PROVIDER_RATES_USD_PER_M_TOK.get(provider, {"in": 0.0, "out": 0.0})
    return (input_tokens * rates["in"] + output_tokens * rates["out"]) / 1_000_000


def provider_family(name: str) -> str:
    return name.removeprefix("cached-") if name else name


class Provider(Protocol):
    name: str
    model: str

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult: ...


class MockProvider:
    def __init__(self, name: str = "mock", model: str = "mock-1"):
        self.name = name
        self.model = model

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        start = time.perf_counter()
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"), ""
        )
        text = _mock_reply(last_user)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text=text,
            latency_ms=elapsed_ms,
            input_tokens=sum(len(m.content) for m in messages) // 4,
            output_tokens=len(text) // 4,
        )


def _mock_reply(prompt: str) -> str:
    p = prompt.lower()
    if "verify the top" in p or "confirm" in p or "final root-cause" in p:
        if "tool_unavailable" in p:
            return (
                "Cannot confirm. Both kubectl and prometheus were unavailable; "
                "no observability signal supports a verdict."
            )
        if "memory_leak" in p or "oom" in p or "oomkilled" in p:
            return (
                "Confirmed. Root cause: OOMKilled - pod exceeded its 64Mi memory "
                "limit. Remediation: raise the limit or fix the underlying leak."
            )
        if "coredns" in p or "nslookup" in p or "nameserver" in p:
            return (
                "Confirmed. Root cause: CoreDNS Corefile has an invalid upstream "
                "nameserver entry. Remediation: restore the Corefile ConfigMap "
                "from a known-good revision."
            )
        if "database_url" in p or "env_var_missing" in p:
            return (
                "Confirmed. Root cause: missing DATABASE_URL environment variable. "
                "The deployment spec sets DATABASE_URL=\"\" and the container "
                "command guard fails immediately, producing the CrashLoopBackOff "
                "loop observed in `kubectl get pods`. Remediation: set a non-empty "
                "DATABASE_URL via Secret or downstream config injection."
            )
        return "Confirmed at low confidence. Recommend manual review."
    if "hypothes" in p or "what could be" in p:
        if "tool_unavailable" in p:
            return (
                "Hypothesis 1 (confidence 0.30): Insufficient signal in findings - "
                "both kubectl and prometheus tools were unavailable for this run. "
                "Recommend re-running with at least one observability tool live."
            )
        if "oom" in p or "memory_leak" in p or "oomkilled" in p or "memoryerror" in p:
            return (
                "Hypothesis 1 (confidence 0.82): Pod was OOMKilled due to "
                "exceeding its memory limit. Heap growth pattern in metrics "
                "suggests a memory leak in the workload.\n\n"
                "Top hypothesis: memory_leak_pod_a"
            )
        if "dns" in p or "coredns" in p or "resolve" in p or "nslookup" in p or "nameserver" in p:
            return (
                "Hypothesis 1 (confidence 0.79): CoreDNS Corefile references an "
                "invalid upstream nameserver. Cluster DNS resolution failing for "
                "the app pod.\n\n"
                "Top hypothesis: coredns_corefile_misconfig"
            )
        if "crashloop" in p or "database_url" in p or "env_var_missing" in p or (
            "env" in p and "missing" in p
        ):
            return (
                "Hypothesis 1 (confidence 0.86): The container fails its preflight "
                "check because the DATABASE_URL environment variable is empty. The "
                "command `test -n \"$DATABASE_URL\" || exit 1` exits non-zero, which "
                "the kubelet observes as a crash and restarts in CrashLoopBackOff.\n\n"
                "Hypothesis 2 (confidence 0.18): The nginx image itself is failing "
                "to start. This is unlikely given the explicit command override.\n\n"
                "Top hypothesis: env_var_missing"
            )
        return (
            "Hypothesis 1 (confidence 0.55): Insufficient signal in findings; "
            "recommend re-running investigation with broader tool set."
        )
    if "plan" in p or "next step" in p:
        return (
            "Plan:\n1. kubectl get pods to identify the failing pod\n"
            "2. kubectl describe pod to inspect events and container states\n"
            "3. kubectl logs (with --previous if needed) to capture exit signal\n"
            "4. Form hypotheses from findings\n"
            "5. Verify top hypothesis"
        )
    return "Acknowledged."


class GroqProvider:
    name = "groq"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ):
        api_key = api_key or os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ProviderError("GROQ_API_KEY not set")
        from groq import Groq

        self.client = Groq(api_key=api_key)
        self.model = model or os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.max_tokens = max_tokens

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        chat = [{"role": m.role, "content": m.content} for m in messages]
        start = time.perf_counter()
        resp = self.client.chat.completions.create(
            model=self.model,
            max_tokens=kwargs.get("max_tokens", self.max_tokens),
            messages=chat,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        text = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text=text,
            latency_ms=elapsed_ms,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        )


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        host: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ):
        import httpx

        self.host = (host or os.environ.get("OLLAMA_HOST", "http://localhost:11434")).rstrip("/")
        self.model = model or os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
        self.timeout = timeout
        self._httpx = httpx

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        chat = [{"role": m.role, "content": m.content} for m in messages]
        body = {
            "model": self.model,
            "messages": chat,
            "stream": False,
            "options": {"num_predict": kwargs.get("max_tokens", 1024)},
        }
        start = time.perf_counter()
        try:
            with self._httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.host}/api/chat", json=body)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            raise ProviderError(f"ollama request failed: {exc}") from exc
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        text = (data.get("message") or {}).get("content", "")
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text=text,
            latency_ms=elapsed_ms,
            input_tokens=data.get("prompt_eval_count", 0) or 0,
            output_tokens=data.get("eval_count", 0) or 0,
        )


class TrueFoundryProvider:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        max_tokens: int = 1024,
        name: str = "truefoundry",
    ):
        api_key = api_key or os.environ.get("TRUEFOUNDRY_API_KEY")
        if not api_key:
            raise ProviderError("TRUEFOUNDRY_API_KEY not set")
        from openai import OpenAI

        gateway_url = (
            base_url
            or os.environ.get("TRUEFOUNDRY_GATEWAY_URL")
            or "https://gateway.truefoundry.ai"
        ).rstrip("/")
        if not gateway_url.endswith("/api/inference/openai"):
            gateway_url = f"{gateway_url}/api/inference/openai"
        self.client = OpenAI(api_key=api_key, base_url=f"{gateway_url}/v1")
        self.name = name
        self.model = (
            model
            or os.environ.get("TRUEFOUNDRY_MODEL")
            or "openai-main/openai/gpt-4o-mini"
        )
        self.max_tokens = max_tokens

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        chat = [{"role": m.role, "content": m.content} for m in messages]
        start = time.perf_counter()
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                max_tokens=kwargs.get("max_tokens", self.max_tokens),
                messages=chat,
            )
        except Exception as exc:
            raise ProviderError(f"truefoundry request failed: {exc}") from exc
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        text = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text=text,
            latency_ms=elapsed_ms,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        )


class _Ewma:
    def __init__(self, alpha: float = 0.3):
        self.alpha = alpha
        self.value: float | None = None

    def update(self, sample: float) -> float:
        if self.value is None:
            self.value = sample
        else:
            self.value = self.alpha * sample + (1.0 - self.alpha) * self.value
        return self.value


class Gateway:
    def __init__(
        self,
        providers: list[Provider],
        routing_policy: list[str] | None = None,
        latency_brownout_ms: float = 8000.0,
        chaos: Any | None = None,
        cost_aware: bool | None = None,
        budget_usd: float | None = None,
    ):
        if not providers:
            raise ValueError("Gateway needs at least one provider")
        self.providers: dict[str, Provider] = {p.name: p for p in providers}
        self.routing_policy: list[str] = routing_policy or [p.name for p in providers]
        for name in self.routing_policy:
            if name not in self.providers:
                raise ValueError(f"routing_policy refers to unknown provider: {name}")
        self.trace: list[TraceEvent] = []
        self.latency: dict[str, _Ewma] = {n: _Ewma() for n in self.providers}
        self.latency_brownout_ms = latency_brownout_ms
        self.quarantined: set[str] = set()
        self.chaos = chaos
        self.token_budget: int = int(os.environ.get("TOKEN_BUDGET_PER_INVESTIGATION", "20000"))
        self.tokens_spent: int = 0
        self.cost_usd: float = 0.0
        self.cost_by_provider: dict[str, float] = {}
        if cost_aware is None:
            cost_aware = os.environ.get("COST_AWARE", "true").lower() in {"1", "true", "yes"}
        self.cost_aware: bool = cost_aware
        if budget_usd is None:
            budget_usd = float(os.environ.get("COST_BUDGET_USD_PER_INVESTIGATION", "0.50"))
        self.budget_usd: float = budget_usd

    @property
    def primary(self) -> str:
        return self.routing_policy[0]

    def quarantine(self, name: str) -> None:
        if name in self.providers:
            self.quarantined.add(name)
            self.trace.append(TraceEvent(kind="provider_quarantine", provider=name))

    def restore(self, name: str) -> None:
        if name in self.quarantined:
            self.quarantined.remove(name)
            self.trace.append(TraceEvent(kind="provider_restore", provider=name))

    def _candidate_order(self, avoid_family: str | None = None) -> list[str]:
        live = [n for n in self.routing_policy if n not in self.quarantined]
        if avoid_family:
            filtered = [n for n in live if provider_family(n) != avoid_family]
            if filtered:
                live = filtered
        fast, slow = [], []
        for n in live:
            ewma = self.latency[n].value
            if ewma is not None and ewma > self.latency_brownout_ms:
                slow.append(n)
            else:
                fast.append(n)
        return fast + slow

    def reset_budget(self) -> None:
        self.tokens_spent = 0
        self.cost_usd = 0.0
        self.cost_by_provider = {}

    def _estimate_next_call_usd(self, provider_name: str, est_in: int = 500, est_out: int = 500) -> float:
        return estimate_cost_usd(provider_family(provider_name), est_in, est_out)

    def _cost_aware_reorder(self, order: list[str]) -> list[str]:
        remaining = max(0.0, self.budget_usd - self.cost_usd)
        pressure = remaining < (self.budget_usd * 0.5)
        fits: list[tuple[str, float]] = []
        skipped: list[tuple[str, float]] = []
        for n in order:
            est = self._estimate_next_call_usd(n)
            if est <= remaining or est == 0.0:
                fits.append((n, est))
            else:
                skipped.append((n, est))
        for name, est in skipped:
            self.trace.append(
                TraceEvent(
                    kind="provider_skip",
                    provider=name,
                    detail=f"reason=budget_pressure est_cost=${est:.5f} remaining=${remaining:.5f}",
                )
            )
        if fits:
            if pressure:
                fits.sort(key=lambda pair: pair[1])
            return [n for n, _ in fits]
        return order

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        if self.tokens_spent >= self.token_budget:
            self.trace.append(
                TraceEvent(
                    kind="budget_exceeded",
                    detail=f"spent={self.tokens_spent} cap={self.token_budget}",
                )
            )
            raise BudgetExceeded(
                f"token budget exceeded: spent={self.tokens_spent} cap={self.token_budget}"
            )
        avoid_family = kwargs.pop("avoid_family", None)
        order = self._candidate_order(avoid_family=avoid_family)
        if self.cost_aware and order:
            order = self._cost_aware_reorder(order)
        if not order:
            raise ProviderError("no live providers (all quarantined)")
        last_exc: Exception | None = None
        for idx, name in enumerate(order):
            provider = self.providers[name]
            if self.chaos and self.chaos.is_provider_killed(name):
                self.trace.append(
                    TraceEvent(
                        kind="chaos_inject",
                        provider=name,
                        detail="kill_provider",
                    )
                )
                last_exc = ProviderError(f"{name} killed by chaos panel")
                self.trace.append(
                    TraceEvent(
                        kind="provider_error",
                        provider=name,
                        model=provider.model,
                        detail="killed by chaos panel",
                    )
                )
                if idx + 1 < len(order):
                    self.trace.append(
                        TraceEvent(
                            kind="provider_fallback",
                            provider=order[idx + 1],
                            detail=f"from={name}",
                        )
                    )
                continue
            if self.chaos:
                injected = self.chaos.maybe_inject_latency()
                if injected > 0:
                    self.trace.append(
                        TraceEvent(
                            kind="chaos_inject",
                            provider=name,
                            latency_ms=injected,
                            detail="inject_latency",
                        )
                    )
            try:
                result = provider.complete(messages, **kwargs)
            except Exception as exc:
                last_exc = exc
                self.trace.append(
                    TraceEvent(
                        kind="provider_error",
                        provider=provider.name,
                        model=provider.model,
                        detail=str(exc),
                    )
                )
                if idx + 1 < len(order):
                    self.trace.append(
                        TraceEvent(
                            kind="provider_fallback",
                            provider=order[idx + 1],
                            detail=f"from={name}",
                        )
                    )
                continue
            ewma = self.latency[name].update(result.latency_ms)
            call_cost = estimate_cost_usd(
                result.provider, result.input_tokens, result.output_tokens
            )
            self.tokens_spent += result.input_tokens + result.output_tokens
            self.cost_usd += call_cost
            self.cost_by_provider[result.provider] = (
                self.cost_by_provider.get(result.provider, 0.0) + call_cost
            )
            self.trace.append(
                TraceEvent(
                    kind="provider_call",
                    provider=result.provider,
                    model=result.model,
                    latency_ms=result.latency_ms,
                    detail=(
                        f"in={result.input_tokens} out={result.output_tokens} "
                        f"ewma={ewma:.0f}ms cost=${call_cost:.5f} "
                        f"spent={self.tokens_spent}/{self.token_budget}"
                    ),
                )
            )
            return result
        raise ProviderError(f"all providers in routing_policy failed: {last_exc}") from last_exc

    def record(self, kind: str, detail: str = "") -> None:
        self.trace.append(TraceEvent(kind=kind, detail=detail))

    def flush_trace(self) -> list[TraceEvent]:
        events = self.trace
        self.trace = []
        return events


def build_default_gateway() -> Gateway:
    from app.cache import (
        CachedProvider,
        ResponseCache,
        use_cache_enabled,
        write_cache_enabled,
    )
    from app.chaos import get_controller

    chaos = get_controller()
    use_mock = os.environ.get("USE_MOCK_LLM", "true").lower() in {"1", "true", "yes"}
    caching = use_cache_enabled() or write_cache_enabled()

    def _wrap(p: Provider) -> Provider:
        if caching:
            return CachedProvider(p, ResponseCache(), write_through=write_cache_enabled())
        return p

    def _policy_name(base: str) -> str:
        return f"cached-{base}" if caching else base

    if use_mock:
        return Gateway([_wrap(MockProvider())], routing_policy=["mock"], chaos=chaos)

    providers: list[Provider] = []
    policy: list[str] = []

    if os.environ.get("TRUEFOUNDRY_API_KEY"):
        slots = [
            ("tf-primary", os.environ.get("TRUEFOUNDRY_PRIMARY_MODEL")),
            ("tf-verify", os.environ.get("TRUEFOUNDRY_VERIFY_MODEL")),
            ("tf-tertiary", os.environ.get("TRUEFOUNDRY_TERTIARY_MODEL")),
        ]
        for slot_name, slot_model in slots:
            if not slot_model:
                continue
            providers.append(_wrap(TrueFoundryProvider(name=slot_name, model=slot_model)))
            policy.append(_policy_name(slot_name))

    if os.environ.get("OLLAMA_HOST") and _ollama_reachable():
        providers.append(_wrap(OllamaProvider()))
        policy.append(_policy_name("ollama"))

    providers.append(MockProvider())
    policy.append("mock")

    return Gateway(providers, routing_policy=policy, chaos=chaos)


def _ollama_reachable() -> bool:
    try:
        import httpx

        host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        with httpx.Client(timeout=1.0) as client:
            client.get(f"{host}/api/tags")
        return True
    except Exception:
        return False
