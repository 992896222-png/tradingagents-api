const { execFileSync } = require("child_process");
const path = require("path");

exports.handler = async (event, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const ticker = (body.ticker || "").trim().toUpperCase();
  if (!ticker) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing required field: ticker" }),
    };
  }

  try {
    // Build input for the Python worker
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

    // Path to the Python worker script
    const workerPath = path.join(__dirname, "trading_worker.py");

    // Execute the Python worker
    const result = execFileSync("python3", [workerPath], {
      input,
      encoding: "utf-8",
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    // Parse the output
    const output = JSON.parse(result.trim());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(output, null, 2),
    };
  } catch (error) {
    // Try to extract Python error output
    let detail = error.message;
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout.trim());
        detail = parsed.error || parsed;
      } catch {
        detail = error.stdout.trim();
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(detail), ticker }),
    };
  }
};
