#!/usr/bin/env python3
"""
TradingAgents Worker - called as a subprocess by the Node.js Netlify function.

Reads JSON from stdin, runs TradingAgents analysis, outputs JSON to stdout.
"""
import json
import sys
from datetime import datetime


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid input JSON: {e}"}))
        sys.exit(1)

    ticker = input_data.get("ticker", "").strip().upper()
    if not ticker:
        print(json.dumps({"error": "Missing ticker"}))
        sys.exit(1)

    try:
        result = run_analysis(input_data)
        print(json.dumps(result, ensure_ascii=False, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e), "ticker": ticker}, ensure_ascii=False))
        sys.exit(1)


def run_analysis(params: dict) -> dict:
    """Run TradingAgents pipeline and return structured results."""
    from tradingagents.config import TradingAgentsConfig, set_config
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    ticker = params["ticker"]
    trade_date = params.get("date") or datetime.now().strftime("%Y-%m-%d")

    config = TradingAgentsConfig(
        llm_provider=params.get("llm_provider", "openai"),
        deep_think_llm=params.get("deep_think_llm", "gpt-5.4"),
        quick_think_llm=params.get("quick_think_llm", "gpt-5.4-mini"),
        max_debate_rounds=params.get("max_debate_rounds", 1),
        max_risk_discuss_rounds=params.get("max_risk_discuss_rounds", 1),
        response_language=params.get("response_language", "zh-CN"),
        reasoning_effort=params.get("reasoning_effort", "medium"),
        max_recur_limit=100,
    )
    set_config(config)

    ta = TradingAgentsGraph(debug=False, config=config)
    summary, decision = ta.propagate(ticker, trade_date)

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


if __name__ == "__main__":
    main()
