import json
import pickle
from dataclasses import dataclass
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F


def norm(x: torch.Tensor) -> torch.Tensor:
    return F.rms_norm(x, (x.size(-1),))


def apply_rotary_emb(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    half = x.shape[-1] // 2
    x1, x2 = x[..., :half], x[..., half:]
    y1 = x1 * cos + x2 * sin
    y2 = x1 * (-sin) + x2 * cos
    return torch.cat([y1, y2], dim=-1)


class Linear(nn.Linear):
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.linear(x, self.weight.to(dtype=x.dtype))


@dataclass
class NanoChatConfig:
    sequence_len: int
    vocab_size: int
    n_layer: int
    n_head: int
    n_kv_head: int
    n_embd: int
    window_pattern: str = "L"
    use_resid_lambdas: bool = False
    use_x0_lambdas: bool = False
    use_smear: bool = False
    use_backout: bool = False
    use_value_embeddings: bool = False
    softcap: float = 15.0

    @classmethod
    def from_meta_and_state(cls, meta_path: Path, state_dict: dict) -> "NanoChatConfig":
        with meta_path.open("r", encoding="utf-8") as handle:
            meta = json.load(handle)
        model_config = meta["model_config"]
        value_embedding_keys = [key for key in state_dict if key.startswith("value_embeds.")]
        return cls(
            sequence_len=model_config["sequence_len"],
            vocab_size=model_config["vocab_size"],
            n_layer=model_config["n_layer"],
            n_head=model_config["n_head"],
            n_kv_head=model_config.get("n_kv_head", model_config["n_head"]),
            n_embd=model_config["n_embd"],
            window_pattern=model_config.get("window_pattern", "L"),
            use_resid_lambdas="resid_lambdas" in state_dict,
            use_x0_lambdas="x0_lambdas" in state_dict,
            use_smear="smear_gate.weight" in state_dict and "smear_lambda" in state_dict,
            use_backout="backout_lambda" in state_dict,
            use_value_embeddings=bool(value_embedding_keys),
        )


class NanoChatTokenizer:
    def __init__(self, tokenizer_path: Path):
        with tokenizer_path.open("rb") as handle:
            self.enc = pickle.load(handle)
        self._bos = self.encode_special("<|bos|>")
        self._user_start = self.encode_special("<|user_start|>")
        self._user_end = self.encode_special("<|user_end|>")
        self._assistant_start = self.encode_special("<|assistant_start|>")
        self._assistant_end = self.encode_special("<|assistant_end|>")

    def get_vocab_size(self) -> int:
        return self.enc.n_vocab

    def encode_special(self, token: str) -> int:
        return self.enc.encode_single_token(token)

    def encode(self, text: str, allowed_special=None):
        return self.enc.encode_ordinary(text)

    def decode(self, tokens) -> str:
        return self.enc.decode(tokens)

    def build_prompt_tokens(self, user_message: str) -> list[int]:
        tokens = [self._bos, self._user_start]
        tokens.extend(self.encode(user_message))
        tokens.extend([self._user_end, self._assistant_start])
        return tokens

    @property
    def assistant_end_token_id(self) -> int:
        return self._assistant_end


class NanoChatAttention(nn.Module):
    def __init__(self, config: NanoChatConfig, layer_idx: int):
        super().__init__()
        self.layer_idx = layer_idx
        self.n_head = config.n_head
        self.n_kv_head = config.n_kv_head
        self.head_dim = config.n_embd // config.n_head
        self.c_q = Linear(config.n_embd, self.n_head * self.head_dim, bias=False)
        self.c_k = Linear(config.n_embd, self.n_kv_head * self.head_dim, bias=False)
        self.c_v = Linear(config.n_embd, self.n_kv_head * self.head_dim, bias=False)
        self.c_proj = Linear(config.n_embd, config.n_embd, bias=False)

    def forward(self, x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
        batch_size, seq_len, channels = x.size()
        q = self.c_q(x).view(batch_size, seq_len, self.n_head, self.head_dim)
        k = self.c_k(x).view(batch_size, seq_len, self.n_kv_head, self.head_dim)
        v = self.c_v(x).view(batch_size, seq_len, self.n_kv_head, self.head_dim)

        q = apply_rotary_emb(q, cos, sin)
        k = apply_rotary_emb(k, cos, sin)
        q = norm(q) * 1.2
        k = norm(k) * 1.2

        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        if self.n_kv_head != self.n_head:
            repeat_factor = self.n_head // self.n_kv_head
            k = k.repeat_interleave(repeat_factor, dim=1)
            v = v.repeat_interleave(repeat_factor, dim=1)

        y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        y = y.transpose(1, 2).contiguous().view(batch_size, seq_len, channels)
        return self.c_proj(y)


class NanoChatMLP(nn.Module):
    def __init__(self, config: NanoChatConfig):
        super().__init__()
        self.c_fc = Linear(config.n_embd, 4 * config.n_embd, bias=False)
        self.c_proj = Linear(4 * config.n_embd, config.n_embd, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.c_fc(x)
        x = F.relu(x).square()
        return self.c_proj(x)


class NanoChatBlock(nn.Module):
    def __init__(self, config: NanoChatConfig, layer_idx: int):
        super().__init__()
        self.attn = NanoChatAttention(config, layer_idx)
        self.mlp = NanoChatMLP(config)

    def forward(self, x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(norm(x), cos, sin)
        x = x + self.mlp(norm(x))
        return x


class NanoChatGPT(nn.Module):
    def __init__(self, config: NanoChatConfig):
        super().__init__()
        self.config = config
        self.transformer = nn.ModuleDict(
            {
                "wte": nn.Embedding(config.vocab_size, config.n_embd),
                "h": nn.ModuleList([NanoChatBlock(config, layer_idx) for layer_idx in range(config.n_layer)]),
            }
        )
        self.lm_head = Linear(config.n_embd, config.vocab_size, bias=False)

        if config.use_resid_lambdas:
            self.resid_lambdas = nn.Parameter(torch.ones(config.n_layer))
        else:
            self.register_parameter("resid_lambdas", None)

        if config.use_x0_lambdas:
            self.x0_lambdas = nn.Parameter(torch.zeros(config.n_layer))
        else:
            self.register_parameter("x0_lambdas", None)

        if config.use_smear:
            self.smear_gate = Linear(24, 1, bias=False)
            self.smear_lambda = nn.Parameter(torch.zeros(1))
        else:
            self.smear_gate = None
            self.register_parameter("smear_lambda", None)

        if config.use_backout:
            self.backout_lambda = nn.Parameter(0.2 * torch.ones(1))
        else:
            self.register_parameter("backout_lambda", None)

        self.value_embeds = nn.ModuleDict()

        self.rotary_seq_len = config.sequence_len
        cos, sin = self._precompute_rotary_embeddings(self.rotary_seq_len, config.n_embd // config.n_head)
        self.register_buffer("cos", cos, persistent=False)
        self.register_buffer("sin", sin, persistent=False)

    def _precompute_rotary_embeddings(self, seq_len: int, head_dim: int, base: int = 100000):
        channel_range = torch.arange(0, head_dim, 2, dtype=torch.float32)
        inv_freq = 1.0 / (base ** (channel_range / head_dim))
        positions = torch.arange(seq_len, dtype=torch.float32)
        freqs = torch.outer(positions, inv_freq)
        cos = freqs.cos()[None, :, None, :]
        sin = freqs.sin()[None, :, None, :]
        return cos, sin

    def forward(self, idx: torch.Tensor):
        _, seq_len = idx.size()
        assert seq_len <= self.config.sequence_len, (
            f"Sequence length {seq_len} exceeds sequence_len {self.config.sequence_len}"
        )

        x = self.transformer["wte"](idx)
        x = norm(x)
        x0 = x
        x_backout = None
        cos = self.cos[:, :seq_len].to(dtype=x.dtype, device=x.device)
        sin = self.sin[:, :seq_len].to(dtype=x.dtype, device=x.device)
        backout_layer = self.config.n_layer // 2

        if self.smear_gate is not None and seq_len > 1:
            gate = self.smear_lambda.to(x.dtype) * torch.sigmoid(self.smear_gate(x[:, 1:, :24]))
            x = torch.cat([x[:, :1], x[:, 1:] + gate * x[:, :-1]], dim=1)

        for layer_idx, block in enumerate(self.transformer["h"]):
            if self.resid_lambdas is not None:
                x = self.resid_lambdas[layer_idx].to(x.dtype) * x
            if self.x0_lambdas is not None:
                x = x + self.x0_lambdas[layer_idx].to(x.dtype) * x0
            x = block(x, cos, sin)
            if self.backout_lambda is not None and layer_idx == backout_layer:
                x_backout = x

        if self.backout_lambda is not None and x_backout is not None:
            x = x - self.backout_lambda.to(x.dtype) * x_backout

        x = norm(x)
        logits = self.lm_head(x).float()
        if self.config.softcap > 0:
            softcap = self.config.softcap
            logits = softcap * torch.tanh(logits / softcap)
        return logits


def sample_next_token(logits: torch.Tensor, temperature: float, top_k: int = 50) -> torch.Tensor:
    if temperature <= 0:
        return torch.argmax(logits, dim=-1, keepdim=True)

    safe_temperature = max(float(temperature), 1e-5)
    logits = logits / safe_temperature
    logits = torch.nan_to_num(logits, nan=-1e9, posinf=1e9, neginf=-1e9)

    if top_k is not None and top_k > 0:
        values, _ = torch.topk(logits, min(top_k, logits.size(-1)))
        logits[logits < values[:, [-1]]] = -float("inf")

    probs = F.softmax(logits, dim=-1)
    probs = torch.nan_to_num(probs, nan=0.0, posinf=0.0, neginf=0.0)
    probs_sum = probs.sum(dim=-1, keepdim=True)
    if torch.any(probs_sum <= 0):
        return torch.argmax(logits, dim=-1, keepdim=True)
    probs = probs / probs_sum
    return torch.multinomial(probs, num_samples=1)


class NanoChatRuntime:
    def __init__(self, model_dir: Path, checkpoint_path: Path, device: str):
        self.model_dir = model_dir
        self.checkpoint_path = checkpoint_path
        self.device = device
        self.tokenizer = NanoChatTokenizer(model_dir / "tokenizer.pkl")
        state_dict = torch.load(str(checkpoint_path), map_location=device, weights_only=False)
        self.config = NanoChatConfig.from_meta_and_state(model_dir / "meta_000650.json", state_dict)
        self.model = NanoChatGPT(self.config)
        missing, unexpected = self.model.load_state_dict(state_dict, strict=False)
        if unexpected:
            raise RuntimeError(f"Unexpected NanoChat state keys: {unexpected}")
        if missing:
            print(f"NanoChat missing keys patched with defaults: {missing}")
        self.model.to(device)
        self.model.eval()

    def build_prompt_tokens(self, user_message: str) -> list[int]:
        return self.tokenizer.build_prompt_tokens(user_message)

    def generate_response(self, user_message: str, temperature: float = 0.6, max_new_tokens: int = 200) -> str:
        generated_tokens = list(self.generate_tokens_stream(user_message, temperature, max_new_tokens))
        return "".join(generated_tokens).strip()

    def generate_tokens_stream(self, user_message: str, temperature: float = 0.6, max_new_tokens: int = 200):
        prompt_tokens = self.build_prompt_tokens(user_message)
        idx = torch.tensor(prompt_tokens, dtype=torch.long, device=self.device).unsqueeze(0)

        with torch.no_grad():
            for _ in range(max_new_tokens):
                idx_cond = idx[:, -self.config.sequence_len:]
                logits = self.model(idx_cond)
                next_token = sample_next_token(logits[:, -1, :], temperature)
                token_id = next_token.item()
                if token_id == self.tokenizer.assistant_end_token_id:
                    break
                idx = torch.cat((idx, next_token), dim=1)
                yield self.tokenizer.decode([token_id])


def get_nanochat_spec(model_root: Path, device: str):
    runtime_dir = model_root / "nanochat"
    checkpoint_path = model_root / "model_000650.pt"
    return {
        "name": "NanoChat",
        "description": "NanoChat pretrained checkpoint",
        "runtime_factory": lambda: NanoChatRuntime(runtime_dir, checkpoint_path, device),
    }
