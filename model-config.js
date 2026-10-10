// Pin both the runtime and model revision; no grades or identities belong here.
globalThis.CC_MODEL = Object.freeze({
  runtime: './assets/vendor/wllama-3.8.1/esm/index.js',
  wasm: './assets/vendor/wllama-3.8.1/src/wasm/wllama.wasm',
  compatWorker: './assets/vendor/wllama-compat-3.8.1/wasm/wllama.js',
  compatWasm: './assets/vendor/wllama-compat-3.8.1/wasm/wllama.wasm',
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  cache: 'cc-feedback-model-v1'
});
