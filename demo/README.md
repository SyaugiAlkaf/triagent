# Pre-cached LLM responses

`demo/responses_cache.json` holds canned hypothesize + verify responses captured from
real Groq runs. Used by `CachedProvider` (set `USE_CACHE=true` to enable; set
`CAPTURE_CACHE=true` to write new entries during a run).

Cache key today: `sha256(messages[role:content])[:16]`. This means the cache
hits only when the prompt is byte-identical. Pod names embed random suffixes
(crashloop-001-0-<8 chars>-<5 chars>) so a fresh scenario apply produces a new
hash. Day 8 video-prep refinement: normalize pod-name UUIDs before hashing, or
re-key by (scenario_id, role) extracted from the prompt.

For the demo recording flow:
  CAPTURE_CACHE=true USE_MOCK_LLM=false make api   # capture one good run
  USE_CACHE=true make api                          # offline replay

