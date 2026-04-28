from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Callable, Iterator

import torch
import torch.nn.functional as F
import tiktoken

from model_config import GPT, GPTConfig
from nanochat_runtime import NanoChatRuntime, get_nanochat_spec


MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
ENC = tiktoken.get_encoding("gpt2")
EOT_SPECIAL = "<|endoftext|>"
DEFAULT_MAX_TOKENS = 160
MAX_MAX_TOKENS = 256
DEFAULT_MIN_VRAM_GB = 6.0


HistoryItem = dict[str, str]


@dataclass
class LoadedModel:
    name: str
    model: torch.nn.Module | None = None
    tokenizer: object | None = None
    block_size: int | None = None
    prompt_builder: Callable[[list[HistoryItem]], str] | None = None
    custom_runtime: NanoChatRuntime | None = None


def build_buddy_prompt(history: list[HistoryItem]) -> str:
    lines: list[str] = []
    for message in history:
        speaker = "Buddy" if message["role"] == "assistant" else "User"
        lines.append(f"{speaker}: {message['content'].strip()}")
    lines.append("Buddy:")
    return "\n".join(lines)


def build_story_prompt(history: list[HistoryItem]) -> str:
    lines = ["You are a creative storyteller continuing the conversation below."]
    for message in history:
        speaker = "Assistant" if message["role"] == "assistant" else "User"
        lines.append(f"{speaker}: {message['content'].strip()}")
    lines.append("Assistant:")
    return "\n".join(lines)


def build_nanochat_prompt(history: list[HistoryItem]) -> str:
    lines = ["Continue the assistant side of this conversation naturally."]
    for message in history:
        speaker = "Assistant" if message["role"] == "assistant" else "User"
        lines.append(f"{speaker}: {message['content'].strip()}")
    lines.append("Assistant:")
    return "\n".join(lines)


def select_device() -> str:
    requested = os.getenv("CHATBOT_DEVICE", "auto").strip().lower()
    if requested in {"cpu", "cuda"}:
        if requested == "cuda" and not torch.cuda.is_available():
            return "cpu"
        return requested

    if not torch.cuda.is_available():
        return "cpu"

    min_vram_gb = float(os.getenv("CHATBOT_MIN_VRAM_GB", str(DEFAULT_MIN_VRAM_GB)))
    total_bytes = torch.cuda.get_device_properties(0).total_memory
    total_gb = total_bytes / (1024 ** 3)
    if total_gb < min_vram_gb:
        return "cpu"

    return "cuda"


CURRENT_DEVICE = select_device()


def build_model_specs(device: str):
    return {
        "buddy": {
            "name": "Innocent Buddy",
            "checkpoint": "buddy_model_final.pt",
            "model_factory": lambda: GPT(GPTConfig()),
            "state_key": "model_state_dict",
            "block_size": GPTConfig().block_size,
            "tokenizer": ENC,
            "prompt_builder": build_buddy_prompt,
        },
        "story_creator": {
            "name": "Story Creator",
            "checkpoint": "tiny_transformer_iter_15000.pt",
            "model_factory": lambda: GPT(GPTConfig()),
            "state_key": "model_state_dict",
            "block_size": GPTConfig().block_size,
            "tokenizer": ENC,
            "prompt_builder": build_story_prompt,
        },
        "nanochat": {
            **get_nanochat_spec(MODEL_DIR, device),
            "prompt_builder": build_nanochat_prompt,
        },
    }


MODEL_SPECS = build_model_specs(CURRENT_DEVICE)

LOADED_MODELS: dict[str, LoadedModel] = {}


def extract_state_dict(checkpoint: object, state_key: str | None):
    if state_key is None:
        return checkpoint
    if not isinstance(checkpoint, dict) or state_key not in checkpoint:
        raise KeyError(f"Expected checkpoint key '{state_key}'")
    return checkpoint[state_key]


def list_models() -> list[dict[str, str]]:
    return [
        {
            "id": model_id,
            "name": spec["name"],
        }
        for model_id, spec in MODEL_SPECS.items()
    ]


def switch_device(device: str) -> None:
    global CURRENT_DEVICE, MODEL_SPECS, LOADED_MODELS
    CURRENT_DEVICE = device
    MODEL_SPECS = build_model_specs(CURRENT_DEVICE)
    LOADED_MODELS = {}
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def ensure_model_loaded(model_id: str) -> LoadedModel:
    selected_model = model_id if model_id in MODEL_SPECS else "nanochat"
    if selected_model in LOADED_MODELS:
        return LOADED_MODELS[selected_model]

    spec = MODEL_SPECS[selected_model]
    if "runtime_factory" in spec:
        runtime = spec["runtime_factory"]()
        loaded = LoadedModel(
            name=spec["name"],
            prompt_builder=spec["prompt_builder"],
            custom_runtime=runtime,
        )
        LOADED_MODELS[selected_model] = loaded
        return loaded

    model = spec["model_factory"]()
    checkpoint = torch.load(
        str(MODEL_DIR / spec["checkpoint"]),
        map_location=CURRENT_DEVICE,
        weights_only=False,
    )
    state_dict = extract_state_dict(checkpoint, spec["state_key"])
    model.load_state_dict(state_dict)
    model.to(CURRENT_DEVICE)
    model.eval()

    loaded = LoadedModel(
        name=spec["name"],
        model=model,
        tokenizer=spec["tokenizer"],
        block_size=spec["block_size"],
        prompt_builder=spec["prompt_builder"],
    )
    LOADED_MODELS[selected_model] = loaded
    return loaded


def sample_next_token(logits: torch.Tensor, temperature: float) -> torch.Tensor:
    if temperature <= 0:
        return torch.argmax(logits, dim=-1, keepdim=True)

    safe_temperature = max(float(temperature), 1e-5)
    logits = logits / safe_temperature
    logits = torch.nan_to_num(logits, nan=-1e9, posinf=1e9, neginf=-1e9)

    values, _ = torch.topk(logits, min(50, logits.size(-1)))
    logits[logits < values[:, [-1]]] = -float("inf")

    probs = F.softmax(logits, dim=-1)
    probs = torch.nan_to_num(probs, nan=0.0, posinf=0.0, neginf=0.0)
    probs_sum = probs.sum(dim=-1, keepdim=True)
    if torch.any(probs_sum <= 0):
        return torch.argmax(logits, dim=-1, keepdim=True)

    probs = probs / probs_sum
    return torch.multinomial(probs, num_samples=1)


def resolve_max_tokens(max_tokens: int | None) -> int:
    if max_tokens is None:
        return DEFAULT_MAX_TOKENS
    return max(1, min(int(max_tokens), MAX_MAX_TOKENS))


def generate_with_standard_model(
    runtime: LoadedModel,
    prompt: str,
    temperature: float,
    max_new_tokens: int,
) -> str:
    return "".join(
        generate_tokens_with_standard_model(runtime, prompt, temperature, max_new_tokens)
    ).strip()


def generate_tokens_with_standard_model(
    runtime: LoadedModel,
    prompt: str,
    temperature: float,
    max_new_tokens: int,
) -> Iterator[str]:
    if runtime.tokenizer is None or runtime.block_size is None or runtime.model is None:
        raise RuntimeError("Standard model runtime is incomplete.")

    tokenizer = runtime.tokenizer
    tokens = tokenizer.encode(prompt, allowed_special={EOT_SPECIAL})
    idx = torch.tensor(tokens, dtype=torch.long, device=CURRENT_DEVICE).unsqueeze(0)

    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -runtime.block_size :]
            logits, _ = runtime.model(idx_cond)
            logits = logits[:, -1, :]
            next_token = sample_next_token(logits, temperature)
            idx = torch.cat((idx, next_token), dim=1)
            token_id = next_token.item()
            if token_id == tokenizer.eot_token:
                break
            yield tokenizer.decode([token_id])


def generate_reply(
    model_id: str,
    history: list[HistoryItem],
    temperature: float = 0.6,
    max_new_tokens: int | None = None,
) -> str:
    try:
        runtime = ensure_model_loaded(model_id)
        if runtime.prompt_builder is None:
            raise RuntimeError(f"Model '{model_id}' is missing a prompt builder.")

        prompt = runtime.prompt_builder(history)
        token_limit = resolve_max_tokens(max_new_tokens)

        if runtime.custom_runtime is not None:
            return runtime.custom_runtime.generate_response(
                prompt,
                temperature=temperature,
                max_new_tokens=token_limit,
            ).strip()

        return generate_with_standard_model(runtime, prompt, temperature, token_limit)
    except torch.OutOfMemoryError:
        if CURRENT_DEVICE != "cuda":
            raise
        switch_device("cpu")
        return generate_reply(model_id, history, temperature, max_new_tokens)


def generate_reply_stream(
    model_id: str,
    history: list[HistoryItem],
    temperature: float = 0.6,
    max_new_tokens: int | None = None,
) -> Iterator[str]:
    try:
        runtime = ensure_model_loaded(model_id)
        if runtime.prompt_builder is None:
            raise RuntimeError(f"Model '{model_id}' is missing a prompt builder.")

        prompt = runtime.prompt_builder(history)
        token_limit = resolve_max_tokens(max_new_tokens)

        if runtime.custom_runtime is not None:
            yield from runtime.custom_runtime.generate_tokens_stream(
                prompt,
                temperature=temperature,
                max_new_tokens=token_limit,
            )
            return

        yield from generate_tokens_with_standard_model(runtime, prompt, temperature, token_limit)
    except torch.OutOfMemoryError:
        if CURRENT_DEVICE != "cuda":
            raise
        switch_device("cpu")
        yield from generate_reply_stream(model_id, history, temperature, max_new_tokens)


DEVICE = CURRENT_DEVICE
