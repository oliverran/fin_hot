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
  // with room in the output for the reasoning. 这里的 fallbackFor 让它接在 deepseek-v4.1-flash（网关）之后，
  // 成为默认模型的第三道备用。
  "deepseek-flash": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
    fallbackFor: {
      prefilter: "deepseek-v4.1-flash", score: "deepseek-v4.1-flash", understand: "deepseek-v4.1-flash",
      summarize: "deepseek-v4.1-flash", wording: "deepseek-v4.1-flash", structure: "deepseek-v4.1-flash",
      group: "deepseek-v4.1-flash", groupReview: "deepseek-v4.1-flash", digest: "deepseek-v4.1-flash",
      report: "deepseek-v4.1-flash", translate: "deepseek-v4.1-flash",
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
  // 阿里云 MaaS 网关（OpenAI 兼容）上的 deepseek-v4.1-flash，作为默认模型的第一道备用，见 docs/customize.md 第 8 节。
  // 备用是一串：默认模型 → deepseek-v4.1-flash（网关）→ deepseek-flash（DeepSeek 官方，见上面它自己的 fallbackFor）。
  // 默认先想再答；这里和官网的 deepseek-flash 一样，结构化任务关掉思考。
  "deepseek-v4.1-flash": {
    service: "maas", model: "deepseek-v4.1-flash", baseUrlEnv: "MAAS_BASE_URL", apiKeyEnv: "MAAS_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
    fallbackFor: {
      prefilter: "default", score: "default", understand: "default", summarize: "default", wording: "default",
      structure: "default", group: "default", groupReview: "default", digest: "default", report: "default", translate: "default",
    },
  },
};

/**
 * 每一步默认用的模型（步骤见后台“模型与评测”页），值是上面的名字或 default。没写的步骤用 default。
 * 例：{ score: "glm-5.3-flash-selection", groupReview: "mimo-v2.6-flash" }
 */
export const DEFAULTS: Record<string, string> = {};
