/**
 * TradingAgents API - Pure Node.js Netlify Function
 *
 * Performs multi-agent trading analysis using OpenAI API directly.
 * No Python dependencies needed.
 *
 * POST /api/analyze
 * { "ticker": "NVDA", "date": "2024-05-10", "response_language": "zh-CN" }
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Analyst agent prompts
const AGENTS = {
  technical: {
    name: "Technical Analyst",
    systemPrompt: `You are a senior technical analyst specializing in financial markets.
Analyze the stock's technical indicators, price action, volume, support/resistance levels,
and trend analysis. Provide clear BUY/SELL/HOLD signal with specific price targets and stop-loss levels.
Output in JSON format only.`,
  },
  fundamental: {
    name: "Fundamental Analyst",
    systemPrompt: `You are a senior fundamental analyst.
Analyze the company's financial health, valuation metrics, growth prospects,
competitive position, and industry trends. Provide clear BUY/SELL/HOLD signal.
Output in JSON format only.`,
  },
  sentiment: {
    name: "Sentiment Analyst",
    systemPrompt: `You are a market sentiment analyst.
Analyze market sentiment, institutional positioning, retail sentiment,
and overall market mood toward this stock. Provide clear BUY/SELL/HOLD signal.
Output in JSON format only.`,
  },
};

// Head of Research - synthesizes all analyst reports
const HEAD_OF_RESEARCH_SYSTEM_PROMPT = `You are the Head of Research at a top investment firm.
You have received reports from three senior analysts (Technical, Fundamental, Sentiment).
Your job is to synthesize their analysis into a final trading decision.

You MUST output valid JSON ONLY (no markdown, no code blocks) with this exact structure:
{
  "signal": "BUY" or "SELL" or "HOLD",
  "size_fraction": 0.0 to 1.0,
  "target_price": number or null,
  "stop_loss": number or null,
  "horizon_days": number,
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "rationale": "concise reasoning in the specified language",
  "analyst_summaries": {
    "technical": "summary of technical analysis findings",
    "fundamentals": "summary of fundamental analysis findings",
    "sentiment": "summary of sentiment analysis findings"
  }
}`;

async function callOpenAI(systemPrompt, userMessage, model = "gpt-4o-mini", responseFormat = null) {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2000,
    temperature: 0.3,
  };

  if (responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

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

  if (!OPENAI_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "OPENAI_API_KEY not configured. Please set it in Netlify environment variables." }) };
  }

  const date = body.date || new Date().toISOString().split("T")[0];
  const lang = body.response_language || "zh-CN";
  const deepModel = body.deep_think_llm || "gpt-4o";
  const quickModel = body.quick_think_llm || "gpt-4o-mini";
  const maxDebate = body.max_debate_rounds ?? 1;

  const userMessage = `Analyze stock ${ticker} for trading date ${date}. 
Provide your analysis with specific price targets and stop-loss levels.
Respond in ${lang === "zh-CN" ? "Chinese (Simplified)" : lang}.
Output in JSON format.`;

  try {
    // Phase 1: Run 3 analysts in parallel
    const [technicalReport, fundamentalReport, sentimentReport] = await Promise.all([
      callOpenAI(AGENTS.technical.systemPrompt, userMessage, quickModel, "json"),
      callOpenAI(AGENTS.fundamental.systemPrompt, userMessage, quickModel, "json"),
      callOpenAI(AGENTS.sentiment.systemPrompt, userMessage, quickModel, "json"),
    ]);

    // Phase 2: Head of Research synthesizes (with debate rounds)
    let synthesisInput = `Ticker: ${ticker}\nDate: ${date}\n\n--- Technical Analysis ---\n${technicalReport}\n\n--- Fundamental Analysis ---\n${fundamentalReport}\n\n--- Sentiment Analysis ---\n${sentimentReport}\n\nLanguage: ${lang}`;

    let finalDecision;
    for (let round = 0; round < maxDebate; round++) {
      const result = await callOpenAI(
        HEAD_OF_RESEARCH_SYSTEM_PROMPT,
        round === 0
          ? synthesisInput
          : `${synthesisInput}\n\nPrevious decision: ${JSON.stringify(finalDecision)}\n\nReview and refine your analysis. Consider any disagreements between analysts.`,
        deepModel,
        "json"
      );

      try {
        finalDecision = JSON.parse(result.replace(/```json/g, "").replace(/```/g, "").trim());
      } catch {
        // If parsing fails, use raw text
        finalDecision = { signal: "HOLD", rationale: result };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ticker,
        date,
        signal: finalDecision.signal || "HOLD",
        size_fraction: finalDecision.size_fraction ?? 0,
        target_price: finalDecision.target_price ?? null,
        stop_loss: finalDecision.stop_loss ?? null,
        horizon_days: finalDecision.horizon_days ?? null,
        confidence: finalDecision.confidence || "MEDIUM",
        rationale: finalDecision.rationale || "",
        analyst_summaries: finalDecision.analyst_summaries || {},
      }, null, 2),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, ticker }),
    };
  }
};
