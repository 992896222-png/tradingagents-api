/**
 * TradingAgents API - Netlify Function
 *
 * 支持多 LLM 提供商的个股多智能体分析
 * 当前支持: OpenAI, DeepSeek
 *
 * POST /api/analyze
 * { "ticker": "NVDA", "llm_provider": "deepseek", ... }
 */

// ---- 各 Provider 配置 ----
const PROVIDERS = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: () => process.env.OPENAI_API_KEY || "",
    models: { quick: "gpt-4o-mini", deep: "gpt-4o" },
    supportsJson: true,
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    apiKey: () => process.env.DEEPSEEK_API_KEY || "",
    models: { quick: "deepseek-chat", deep: "deepseek-reasoner" },
    supportsJson: false,  // DeepSeek 不支持 response_format json
  },
};

// ---- 分析师角色提示词 ----
const AGENTS = {
  technical: {
    name: "Technical Analyst",
    prompt: `You are a senior technical analyst specializing in financial markets.
Analyze the stock's technical indicators, price action, volume, support/resistance levels,
and trend analysis. Provide clear BUY/SELL/HOLD signal with specific price targets and stop-loss levels.
Output in JSON format only.`,
  },
  fundamental: {
    name: "Fundamental Analyst",
    prompt: `You are a senior fundamental analyst.
Analyze the company's financial health, valuation metrics, growth prospects,
competitive position, and industry trends. Provide clear BUY/SELL/HOLD signal.
Output in JSON format only.`,
  },
  sentiment: {
    name: "Sentiment Analyst",
    prompt: `You are a market sentiment analyst.
Analyze market sentiment, institutional positioning, retail sentiment,
and overall market mood toward this stock. Provide clear BUY/SELL/HOLD signal.
Output in JSON format only.`,
  },
};

const HEAD_PROMPT = `You are the Head of Research at a top investment firm.
You have received reports from three senior analysts (Technical, Fundamental, Sentiment).
Your job is to synthesize their analysis into a final trading decision.

Output valid JSON ONLY with this exact structure:
{
  "signal": "BUY" or "SELL" or "HOLD",
  "size_fraction": 0.0 to 1.0,
  "target_price": number or null,
  "stop_loss": number or null,
  "horizon_days": number,
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "rationale": "concise reasoning in the specified language",
  "analyst_summaries": {
    "technical": "summary",
    "fundamentals": "summary",
    "sentiment": "summary"
  }
}`;

// ---- 通用 LLM 调用 ----
async function callLLM(providerKey, systemPrompt, userMessage, model, expectJson) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`);

  const apiKey = provider.apiKey();
  if (!apiKey) throw new Error(`${provider.name} API key not configured`);

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 4096,
    temperature: 0.3,
  };

  if (expectJson && provider.supportsJson) {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${provider.name} API error (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

// ---- 解析 JSON（兼容各种格式） ----
function parseJson(text) {
  // 尝试直接解析
  try { return JSON.parse(text); } catch {}

  // 去掉 markdown 代码块标记
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/\s*```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}

  // 尝试从 \`\`\`json 和 \`\`\` 之间提取
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch {}
  }

  return null;
}

// ---- 主处理函数 ----
exports.handler = async (event, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed. Use POST." }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const ticker = (body.ticker || "").trim().toUpperCase();
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required field: ticker" }) };
  }

  const provider = body.llm_provider || "openai";
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unsupported provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(", ")}` }) };
  }

  const apiKey = providerConfig.apiKey();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: `${providerConfig.name} API key not configured. Set ${provider.toUpperCase()}_API_KEY in environment variables.`,
        provider,
      }),
    };
  }

  const date = body.date || new Date().toISOString().split("T")[0];
  const lang = body.response_language || "zh-CN";
  const deepModel = body.deep_think_llm || providerConfig.models.deep;
  const quickModel = body.quick_think_llm || providerConfig.models.quick;
  const maxDebate = body.max_debate_rounds ?? 1;
  const reasoningEffort = body.reasoning_effort || "medium";

  const langLabel = lang === "zh-CN" ? "Chinese (Simplified)" : lang === "zh-TW" ? "Chinese (Traditional)" : lang;
  const userMessage = `Analyze stock ${ticker} for trading date ${date}. 
Provide your analysis with specific price targets and stop-loss levels.
Respond in ${langLabel}.
Output in JSON format.`;

  try {
    // Phase 1: 三个分析师并行分析
    const analystResults = await Promise.all(
      Object.entries(AGENTS).map(([key, agent]) =>
        callLLM(provider, agent.prompt, userMessage, quickModel, true)
          .then(content => ({ key, name: agent.name, content }))
          .catch(err => ({ key, name: agent.name, content: `{"error":"${err.message}"}` }))
      )
    );

    const reports = {};
    for (const r of analystResults) {
      reports[r.key] = r.content;
    }

    // Phase 2: 研究主管综合
    let synthesisInput = `Ticker: ${ticker}\nDate: ${date}\n\n`;
    for (const [key, agent] of Object.entries(AGENTS)) {
      synthesisInput += `--- ${agent.name} ---\n${reports[key]}\n\n`;
    }
    synthesisInput += `Language: ${langLabel}\nReasoning Effort: ${reasoningEffort}`;

    let finalDecision = null;
    for (let round = 0; round < maxDebate; round++) {
      const inputText = round === 0
        ? synthesisInput
        : `${synthesisInput}\n\nPrevious decision: ${JSON.stringify(finalDecision)}\n\nReview and refine.`;
      const result = await callLLM(provider, HEAD_PROMPT, inputText, deepModel, true);
      const parsed = parseJson(result);
      if (parsed) finalDecision = parsed;
    }

    if (!finalDecision) {
      finalDecision = { signal: "HOLD", rationale: "Unable to parse LLM output" };
    }

    const analystSummaries = {};
    for (const [key, content] of Object.entries(reports)) {
      const parsed = parseJson(content);
      analystSummaries[key] = parsed && parsed.rationale ? parsed.rationale : content.slice(0, 200);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ticker,
        date,
        llm_provider: provider,
        signal: finalDecision.signal || "HOLD",
        size_fraction: finalDecision.size_fraction ?? 0,
        target_price: finalDecision.target_price ?? null,
        stop_loss: finalDecision.stop_loss ?? null,
        horizon_days: finalDecision.horizon_days ?? null,
        confidence: finalDecision.confidence || "MEDIUM",
        rationale: finalDecision.rationale || "",
        analyst_summaries: analystSummaries,
      }, null, 2),
    };
  } catch (error) {
    // 尝试从分析师结果中获取更多信息
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, ticker, provider }),
    };
  }
};
