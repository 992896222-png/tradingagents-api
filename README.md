# TradingAgents Netlify API

多智能体 LLM 金融交易分析框架，通过 Netlify Functions 部署为 API。

## 项目结构

```
netlify-tradingapi/
├── netlify/
│   └── functions/
│       └── analyze.py        # API 函数入口
├── index.html                 # 测试页面
├── netlify.toml               # Netlify 构建配置
├── requirements.txt           # Python 依赖
└── .env.example               # 环境变量模板
```

## API 接口

### `POST /api/analyze`

请求体：

```json
{
  "ticker": "NVDA",
  "llm_provider": "openai",
  "deep_think_llm": "gpt-5.4",
  "quick_think_llm": "gpt-5.4-mini",
  "max_debate_rounds": 1,
  "response_language": "zh-CN"
}
```

返回：

```json
{
  "ticker": "NVDA",
  "signal": "BUY",
  "size_fraction": 0.3,
  "confidence": "HIGH",
  "rationale": "..."
}
```

## 部署步骤

### 方式一：Git 自动部署（推荐）

```bash
# 1. 初始化 Git
cd netlify-tradingapi
git init
git add .
git commit -m "init: TradingAgents API"

# 2. 推送到 GitHub
# 在 GitHub 新建仓库后：
git remote add origin https://github.com/你的用户名/tradingagents-api.git
git push -u origin main

# 3. 在 Netlify Dashboard 接入
# - 登录 https://app.netlify.com
# - Add new site → Import an existing project → 选 GitHub 仓库
# - Build command: 留空
# - Publish directory: .
# - 点 Deploy
```

### 方式二：Netlify CLI 手动部署

```bash
# 1. 安装 Netlify CLI
npm install -g netlify-cli

# 2. 登录
netlify login

# 3. 部署
cd netlify-tradingapi
netlify deploy --prod
```

## 配置环境变量

部署后，在 Netlify Dashboard 设置环境变量：

1. 进入 **Site settings → Environment variables**
2. 添加以下变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `GOOGLE_API_KEY` | Google Gemini Key | `AIza...` |
| `ANTHROPIC_API_KEY` | Anthropic Claude Key | `sk-ant-...` |
| `FRED_API_KEY` | (可选) FRED 宏观数据 | 见 fred.stlouisfed.org |

至少设置一个 LLM Provider 的 API Key 才能正常使用。

## 本地测试

```bash
# 安装依赖
pip install -r requirements.txt

# 用 Netlify Dev 启动本地服务
netlify dev

# 访问 http://localhost:8888 打开测试页面
```

## 注意

- Netlify Functions 同步请求超时 60 秒，首次运行 LLM 调用可能耗时较长
- Python 冷启动需要加载依赖，建议保持 function 常驻（可配置定期 Ping）
- API Key 务必在 Netlify Dashboard 设置，不要提交到 Git
