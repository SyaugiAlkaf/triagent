"""Triagent scenario engine - canned cluster telemetry behind an HTTP surface.

Mirrors `app/tools/kubectl.py` / `app/tools/prometheus.py` shapes so the agent
reads the responses identically whether it talks to a real cluster or to this
service. The war room polls /scenarios/active to surface alerts on /ws.
"""
