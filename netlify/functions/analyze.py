"""
TradingAgents Netlify Function API

POST /api/analyze
{
    "ticker": "NVDA",
    "date": "2024-05-10",           # optional, default: today
    "llm_provider": "openai",        # optional, default: openai
    "deep_think_llm": "gpt-5.4",     # optional
    "quick_think_llm": "gpt-5.4-mini", # optional
    "max_debate_rounds": 1,          # optional, default: 1
    "max_risk_discuss_rounds": 1,    # optional, default: 1
    "response_language": "zh-CN",    # optional, default: zh-CN
    "reasoning_effort": "medium"     # optional, default: medium
}

Response:
{
    "ticker": "NVDA",
    "date": "2024-05-10",
    "signal": "BUY",               # BUY / SELL / HOLD
    "size_fraction": 0.3,          # 仓位比例
    "target_price": 950.0,         # 目标价
    "stop_loss": 880.0,            # 止损价
    "horizon_days": 5,             # 持有期
    "confidence": "HIGH",          # HIGH / MEDIUM / LOW
    "rationale": "...",            # 推理摘要
    "analyst_summaries": {         # 各分析师摘要
        "fundamentals": "...",
        "sentiment": "...",
        "news": "...",
        "technical": "..."
    }
}
"""

import json
import os
import sys
from datetime import date, datetime
from typing import Any


def handler(event: dict, context: dict) -> dict:
    """Netlify function handler for TradingAgents analysis API."""

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": headers, "body": ""}

    # Parse request body
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    ticker = body.get("ticker", "").strip().upper()
    if not ticker:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Missing required field: ticker"}),
        }

    # Extract optional parameters with defaults
    params = {
        "ticker": ticker,
        "date": body.get("date"),
        "llm_provider": body.get("llm_provider", "openai"),
        "deep_think_llm": body.get("deep_think_llm", "gpt-5.4"),
        "quick_think_llm": body.get("quick_think_llm", "gpt-5.4-mini"),
        "max_debate_rounds": body.get("max_debate_rounds", 1),
        "max_risk_discuss_rounds": body.get("max_risk_discuss_rounds", 1),
        "response_language": body.get("response_language", "zh-CN"),
        "reasoning_effort": body.get("reasoning_effort", "medium"),
    }

    try:
        result = run_trading_analysis(**params)
        return {"statusCode": 200, "headers": headers, "body": json.dumps(result, ensure_ascii=False)}
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e), "ticker": ticker}, ensure_ascii=False),
        }


def run_trading_analysis(
    ticker: str,
    date: str | None = None,
    llm_provider: str = "openai",
    deep_think_llm: str = "gpt-5.4",
    quick_think_llm: str = "gpt-5.4-mini",
    max_debate_rounds: int = 1,
    max_risk_discuss_rounds: int = 1,
    response_language: str = "zh-CN",
    reasoning_effort: str = "medium",
) -> dict[str, Any]:
    """Run the TradingAgents pipeline and return structured results."""

    # Lazy import to keep cold-start slightly faster
    from tradingagents.config import TradingAgentsConfig, set_config
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    # Resolve trade date
    trade_date = date or datetime.now().strftime("%Y-%m-%d")

    # Build config
    config = TradingAgentsConfig(
        llm_provider=llm_provider,
        deep_think_llm=deep_think_llm,
        quick_think_llm=quick_think_llm,
        max_debate_rounds=max_debate_rounds,
        max_risk_discuss_rounds=max_risk_discuss_rounds,
        response_language=response_language,
        reasoning_effort=reasoning_effort,
        max_recur_limit=100,
    )
    set_config(config)

    # Initialize and run
    ta = TradingAgentsGraph(debug=False, config=config)
    summary, decision = ta.propagate(ticker, trade_date)

    # Structure the output
    return {
        "ticker": ticker,
        "date": trade_date,
        "signal": getattr(decision, "signal", "N/A"),
        "size_fraction": getattr(decision, "size_fraction", 0),
        "target_price": getattr(decision, "target_price", None),
        "stop_loss": getattr(decision, "stop_loss", None),
        "horizon_days": getattr(decision, "horizon_days", None),
        "confidence": getattr(decision, "confidence", "N/A"),
        "rationale": getattr(decision, "rationale", ""),
    }
