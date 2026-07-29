import json
from datetime import datetime


def handler(event, context):
    """TradingAgents Netlify Python Function"""
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": headers, "body": ""}

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

    try:
        from tradingagents.config import TradingAgentsConfig, set_config
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        trade_date = body.get("date") or datetime.now().strftime("%Y-%m-%d")

        config = TradingAgentsConfig(
            llm_provider=body.get("llm_provider", "openai"),
            deep_think_llm=body.get("deep_think_llm", "gpt-5.4"),
            quick_think_llm=body.get("quick_think_llm", "gpt-5.4-mini"),
            max_debate_rounds=body.get("max_debate_rounds", 1),
            max_risk_discuss_rounds=body.get("max_risk_discuss_rounds", 1),
            response_language=body.get("response_language", "zh-CN"),
            reasoning_effort=body.get("reasoning_effort", "medium"),
            max_recur_limit=100,
        )
        set_config(config)

        ta = TradingAgentsGraph(debug=False, config=config)
        summary, decision = ta.propagate(ticker, trade_date)

        result = {
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

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(result, ensure_ascii=False, default=str),
        }
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps(
                {"error": str(e), "traceback": tb, "ticker": ticker},
                ensure_ascii=False,
            ),
        }
