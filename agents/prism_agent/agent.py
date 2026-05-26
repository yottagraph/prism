"""
Prism risk agent.

Conversational ADK agent for portfolio-risk questions. It can:
- resolve entities through Elemental
- query related entities/paths through Elemental
- call back into Prism API endpoints for scored portfolio/entity snapshots
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
import yaml
from google.adk.agents import Agent

try:
    from broadchurch_auth import elemental_client
except ImportError:
    from .broadchurch_auth import elemental_client


def _get_gateway_base() -> str:
    explicit = os.environ.get("PRISM_APP_BASE_URL", "").rstrip("/")
    if explicit:
        return explicit
    for candidate in [Path("broadchurch.yaml"), Path(__file__).parent / "broadchurch.yaml"]:
        if candidate.exists():
            config = yaml.safe_load(candidate.read_text()) or {}
            gw = (config.get("gateway") or {}).get("url", "").rstrip("/")
            org = (config.get("tenant") or {}).get("org_id", "")
            if gw and org:
                return f"{gw}/api/app/{org}"
    return ""


def lookup_entity(name: str) -> dict[str, Any]:
    resp = elemental_client.post(
        "/entities/search",
        json={
            "queries": [{"queryId": 1, "query": name}],
            "maxResults": 5,
            "includeNames": True,
            "includeFlavors": True,
        },
    )
    resp.raise_for_status()
    return resp.json()


def get_related_entities(neid: str, relationship_pid: int, direction: str = "outgoing") -> dict[str, Any]:
    expression = {
        "type": "linked",
        "linked": {
            "expression": {"type": "is_entity", "is_entity": {"eid": neid}},
            "pid": relationship_pid,
            "direction": direction,
        },
    }
    resp = elemental_client.post(
        "/elemental/find",
        data={"expression": json.dumps(expression), "limit": "50"},
    )
    resp.raise_for_status()
    return resp.json()


def get_portfolio_scores(portfolio_id: str) -> dict[str, Any]:
    base = _get_gateway_base()
    if not base:
        return {"error": "PRISM_APP_BASE_URL is not configured"}
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{base}/portfolios/{portfolio_id}/dashboard")
        if resp.status_code >= 400:
            return {"error": f"dashboard route failed ({resp.status_code})", "body": resp.text[:300]}
        return resp.json()


def get_entity_profile(portfolio_id: str, neid: str) -> dict[str, Any]:
    base = _get_gateway_base()
    if not base:
        return {"error": "PRISM_APP_BASE_URL is not configured"}
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{base}/portfolios/{portfolio_id}/entity/{neid}/profile")
        if resp.status_code >= 400:
            return {"error": f"profile route failed ({resp.status_code})", "body": resp.text[:300]}
        return resp.json()


def explain_relationship_path(neid_a: str, neid_b: str) -> dict[str, Any]:
    # Lightweight starting point: resolve neighbors for both entities using a
    # common governance relationship PID. The model can narrate overlap from
    # these sets while we keep the tool deterministic.
    governance_pid = int(os.environ.get("PRISM_GOVERNANCE_PID", "0") or "0")
    if governance_pid <= 0:
        return {"error": "PRISM_GOVERNANCE_PID not configured"}
    a = get_related_entities(neid_a, governance_pid, "incoming")
    b = get_related_entities(neid_b, governance_pid, "incoming")
    a_set = set(a.get("eids", []) or [])
    b_set = set(b.get("eids", []) or [])
    overlap = sorted(a_set.intersection(b_set))
    return {
        "neid_a": neid_a,
        "neid_b": neid_b,
        "relationship_pid": governance_pid,
        "overlap_eids": overlap,
        "count_overlap": len(overlap),
    }


_tools: list[Any] = [
    lookup_entity,
    get_related_entities,
    get_portfolio_scores,
    get_entity_profile,
    explain_relationship_path,
]

_mcp_url = os.environ.get("ELEMENTAL_MCP_URL", "")
if _mcp_url:
    from google.adk.tools.mcp_tool import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

    _tools.append(McpToolset(connection_params=StreamableHTTPConnectionParams(url=_mcp_url)))


root_agent = Agent(
    model="gemini-2.0-flash",
    name="prism_agent",
    instruction="""You are Prism's portfolio-risk analyst.

Use tools to resolve entities, inspect portfolio scores, retrieve profile evidence,
and explain relationship paths. Keep answers concise and evidence-first.

When asked "why is this company ranked high?", return:
1) fused score and tier
2) top drivers by lens
3) cited evidence source for each driver

When asked relationship questions, include the path entities and risk implication.
""",
    tools=_tools,
)

