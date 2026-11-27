// 这个站用哪些模型。框架自带一个 `default`：环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 指定的模型。
// 这里再列出具名的模型（每个用自己的地址和密钥环境变量），以及每一步默认用哪个；没写的步骤用 default。
// 部署时还可以用环境变量（PREFILTER_MODEL、SCORE_MODEL……）或后台的“模型与评测”页逐步改选。

import type { ModelPreset } from "@aihot/contracts/site-config";
export type { ModelPreset } from "@aihot/contracts/site-config";

/** 具名的模型示例（每个要配自己的密钥）。用不上可以删掉。 */
export const PRESETS: Record<string, ModelPreset> = {
  // GLM 5.3 Flash always reasons; the lowest effort keeps short structured tasks fast.
  "glm-5.3-flash": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled" }, reasoning_effort: "low" }, jsonMode: true, vision: true,
  },
  // The scorer's parameters for glm-5.3-flash: temperature 1 with high reasoning, up to 180 s per call.
  "glm-5.3-flash-selection": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled", clear_thinking: false }, reasoning_effort: "high", top_p: 0.95 }, jsonMode: true, vision: true,
    scoreCall: { temperature: 1, maxTokens: 65_536, timeoutMs: 180_000 },
  },
  // DeepSeek Flash reasons by default; structured tasks switch it off. deepseek-flash-think keeps it on,
  // with room in the output for the reasoning. 这里的 fallbackFor 让它接在 minimax-m3.1-flash 之后，
  // 成为默认模型的第三道备用。
  "deepseek-flash": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
    fallbackFor: {
      prefilter: "minimax-m3.1-flash", score: "minimax-m3.1-flash", understand: "minimax-m3.1-flash",
      summarize: "minimax-m3.1-flash", wording: "minimax-m3.1-flash", structure: "minimax-m3.1-flash",
      group: "minimax-m3.1-flash", groupReview: "minimax-m3.1-flash", digest: "minimax-m3.1-flash",
      report: "minimax-m3.1-flash", translate: "minimax-m3.1-flash", opportunity: "minimax-m3.1-flash",
    },
  },
  "deepseek-flash-think": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY", reasoningTokens: 4000, jsonMode: true,
  },
  "qwen3.7-flash": {
    service: "dashscope", model: "qwen3.7-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "qwen3.8-flash": {
    service: "dashscope", model: "qwen3.8-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "mimo-v2.6-flash": {
    service: "mimo", model: "mimo-v2.6-flash", baseUrlEnv: "XIAOMI_MIMO_BASE_URL", apiKeyEnv: "XIAOMI_MIMO_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "qwen3-vl-flash": {
    service: "dashscope", model: "qwen3-vl-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: false, vision: true,
  },
  // MiniMax（OpenAI 兼容），作为默认模型（本站是 TokenHub 上的 hy4-flash）和上面的 hy4-flash-think 的第一道
  // 备用：它们限流或不可用时改用它。备用是一串：主力模型 → minimax-m3.1-flash → deepseek-flash（见它自己的 fallbackFor）。
  // 它和主力模型一样先想再答，保留低强度推理，并给推理留出输出额度。
  "minimax-m3.1-flash": {
    service: "minimax", model: "MiniMax-M3.1-Flash", baseUrlEnv: "MINIMAX_BASE_URL", apiKeyEnv: "MINIMAX_API_KEY",
    extra: { reasoning_effort: "low" }, reasoningTokens: 4000, jsonMode: true,
    fallbackFor: {
      prefilter: "default", score: "hy4-flash-think", understand: "default", summarize: "default", wording: "default",
      structure: "default", group: "hy4-flash-think", groupReview: "hy4-flash-think", digest: "hy4-flash-think",
      report: "hy4-flash-think", translate: "default", opportunity: "hy4-flash-think",
    },
  },
  // 同一个 hy4-flash，开着思考，给评分、归组、事件综述和周报月报用；其余步骤走默认模型（.env 的 LLM_*，
  // 同一个模型关掉思考）。推理 token 和答案共用输出额度，所以多留一些（只是上限，用多少算多少）。
  // service 写 llm：地址、密钥、价格行和熔断都跟默认模型同一条，不是另一家服务商。
  "hy4-flash-think": {
    service: "llm", model: "hy4-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    extra: { thinking: { type: "enabled" } }, reasoningTokens: 12000, jsonMode: true, vision: true,
  },
  // 同一个 hy4-flash，关掉思考：评测里和上面开着思考的版本同批跑，看判分尺度差在哪。
  // 线上「默认模型」（.env 的 LLM_*）也是这个组合，这里写死成具名预设，评测的名字和含义不随 .env 变。
  "hy4-flash-nothink": {
    service: "llm", model: "hy4-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true, vision: true,
  },
  // 阿里云百炼上的同一个 deepseek-v4.1-flash（本站此前的默认模型），和 hy4-flash-think 一样开着思考，
  // 用来在评测里同批对比评分。service 写 dashscope：走 DASHSCOPE_* 的地址与密钥，价格行和熔断也归它。
  "deepseek-v4.1-flash": {
    service: "dashscope", model: "deepseek-v4.1-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { thinking: { type: "enabled" } }, reasoningTokens: 12000, jsonMode: true,
  },
  // 百炼给出的日期快照版本（曾在 11-05 试用过），同一个地址与密钥，用来对照主线模型。
  "deepseek-v4.1-flash-1017": {
    service: "dashscope", model: "deepseek-v4.1-flash-1017", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { thinking: { type: "enabled" } }, reasoningTokens: 12000, jsonMode: true,
  },
  // 下面三个是评测对照用的百炼预设，都走 DASHSCOPE_*，只用来在「评测前沿」同批比评分质量，不参与线上流程。
  // 同一个 deepseek-v4.1-flash-1017，关掉思考：和上面开着思考的版本同批跑，看判分尺度差在哪。
  "deepseek-v4.1-flash-1017-nothink": {
    service: "dashscope", model: "deepseek-v4.1-flash-1017", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  // 百炼上的 DeepSeek-V4-Pro（旗舰，1.6T），开着思考。
  "deepseek-v4-pro": {
    service: "dashscope", model: "deepseek-v4-pro", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { thinking: { type: "enabled" } }, reasoningTokens: 12000, jsonMode: true,
  },
  // 百炼上的 GLM-5.3（智谱旗舰；本账号未开通 GLM-5.3-Flash，用这个代替），开着思考。
  "glm-5.3-bailian": {
    service: "dashscope", model: "glm-5.3", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { thinking: { type: "enabled" } }, reasoningTokens: 12000, jsonMode: true,
  },
};

/**
 * 每一步默认用的模型（步骤见后台“模型与评测”页），值是上面的名字或 default。没写的步骤用 default。
 * 例：{ score: "glm-5.3-flash-selection", groupReview: "mimo-v2.6-flash" }
 */
export const DEFAULTS: Record<string, string> = {
  // 要判断、要写的步骤开着思考；预筛、理解、摘要、改写、结构抽取、翻译这些结构化步骤留给默认模型（思考关着）。
  // opportunity 是机会模块结合行情背景与已发布资讯挑机会与标的的步骤，和事件综述、周报月报一样要判断与写作。
  score: "hy4-flash-think", group: "hy4-flash-think", groupReview: "hy4-flash-think",
  digest: "hy4-flash-think", report: "hy4-flash-think", opportunity: "hy4-flash-think",
};
