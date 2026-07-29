/**
 * TradingAgents Netlify Function
 *
 * A Node.js wrapper that runs the TradingAgents Python analysis as a subprocess.
 * The Python code is embedded inline for reliable deployment.
 */

const { execFileSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const PYTHON_WORKER = `
#!/usr/bin/env python3
import json, sys, os, traceback
from datetime import datetime

def run_analysis(params):
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
        tb = traceback.format_exc()
        print(json.dumps({"error": str(e), "traceback": tb, "ticker": ticker}, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

exports.handler = async (event, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed. Use POST." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const ticker = (body.ticker || "").trim().toUpperCase();
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required field: ticker" }) };
  }

  try {
    // Write Python worker to temp file
    const tmpFile = path.join(os.tmpdir(), `trading_worker_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, PYTHON_WORKER, "utf-8");

    const input = JSON.stringify({
      ticker,
      date: body.date || null,
      llm_provider: body.llm_provider || "openai",
      deep_think_llm: body.deep_think_llm || "gpt-5.4",
      quick_think_llm: body.quick_think_llm || "gpt-5.4-mini",
      max_debate_rounds: body.max_debate_rounds ?? 1,
      max_risk_discuss_rounds: body.max_risk_discuss_rounds ?? 1,
      response_language: body.response_language || "zh-CN",
      reasoning_effort: body.reasoning_effort || "medium",
    });

    // Try python3 first, fall back to python
    let result;
    try {
      result = execFileSync("python3", [tmpFile], {
        input,
        encoding: "utf-8",
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
    } catch (e1) {
      // Fall back to "python"
      result = execFileSync("python", [tmpFile], {
        input,
        encoding: "utf-8",
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
    }

    // Clean up
    try { fs.unlinkSync(tmpFile); } catch {}

    const output = JSON.parse(result.trim());
    return { statusCode: 200, headers, body: JSON.stringify(output, null, 2) };
  } catch (error) {
    let detail = error.message;
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout.trim());
        detail = parsed.traceback || parsed.error || parsed;
      } catch {
        detail = error.stdout.trim().substring(0, 2000);
      }
    } else if (error.stderr) {
      detail = error.stderr.trim().substring(0, 2000);
    }

    return { statusCode: 500, headers, body: JSON.stringify({ error: String(detail), ticker }) };
  }
};
