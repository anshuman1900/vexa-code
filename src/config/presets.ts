/**
 * Built-in OpenAI-compatible provider presets (SPEC §3.4 + user request: famous
 * free/cheap endpoints + local servers). `providers add <preset>` turns one of
 * these into a providerProfile entry. All fields user-overridable.
 */
export interface ProviderPreset {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  contextWindow: number;
  label: string;
  /** local servers: no API key required */
  noAuth?: boolean;
  /** SPEC §3.4 quirk flags surfaced into the profile */
  notes?: string;
  free?: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    contextWindow: 131072,
    label: 'OpenRouter (router — hundreds of models, many :free)',
    free: true,
    notes: 'append :free to model ids for free tier; usage needs stream_options',
  },
  {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    contextWindow: 131072,
    label: 'Groq (free tier, extremely fast)',
    free: true,
  },
  {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    contextWindow: 1048576,
    label: 'Google Gemini OpenAI-compat endpoint (free tier)',
    free: true,
  },
  {
    name: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    contextWindow: 131072,
    label: 'Mistral (free experiment tier)',
    free: true,
  },
  {
    name: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'llama-3.3-70b',
    contextWindow: 128000,
    label: 'Cerebras (free tier, wafer-speed inference)',
    free: true,
  },
  {
    name: 'github',
    baseUrl: 'https://models.github.ai/inference',
    apiKeyEnv: 'GITHUB_TOKEN',
    defaultModel: 'openai/gpt-4.1-mini',
    contextWindow: 128000,
    label: 'GitHub Models (free tier with a GitHub PAT)',
    free: true,
  },
  {
    name: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    contextWindow: 128000,
    label: 'NVIDIA NIM (free credits)',
  },
  {
    name: 'huggingface',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyEnv: 'HF_TOKEN',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    contextWindow: 131072,
    label: 'Hugging Face router (free credits)',
  },
  {
    name: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyEnv: 'ZAI_API_KEY',
    defaultModel: 'glm-4.6',
    contextWindow: 200000,
    label: 'Z.AI / Zhipu GLM (cheap, long context)',
  },
  {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    contextWindow: 128000,
    label: 'DeepSeek (very cheap, strong coder)',
  },
  {
    name: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    contextWindow: 131072,
    label: 'Together AI (cheap open models)',
  },
  {
    name: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnv: 'OLLAMA_API_KEY',
    defaultModel: 'qwen2.5-coder:7b',
    contextWindow: 8192,
    label: 'Ollama (local, free, offline)',
    noAuth: true,
    notes: 'raise contextWindow to match your ollama num_ctx or compaction math lies',
  },
  {
    name: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyEnv: 'LMSTUDIO_API_KEY',
    defaultModel: 'local-model',
    contextWindow: 8192,
    label: 'LM Studio (local, free, offline)',
    noAuth: true,
    notes: 'set contextWindow to the loaded model context',
  },
  {
    name: 'vllm',
    baseUrl: 'http://localhost:8000/v1',
    apiKeyEnv: 'VLLM_API_KEY',
    defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
    contextWindow: 32768,
    label: 'vLLM (self-hosted)',
    noAuth: true,
  },
];

export function getPreset(name: string): ProviderPreset | undefined {
  const lower = name.toLowerCase();
  return PROVIDER_PRESETS.find((p) => p.name === lower);
}
