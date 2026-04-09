"""
Model architecture definition for the fine-tuned Buddy model.
This is a LLaMA-style transformer with:
  - RMSNorm (pre-norm)
  - Rotary Positional Embeddings (RoPE)
  - Separate Wq, Wk, Wv, Wo attention projections
  - Standard 2-layer MLP with GELU activation

Architecture extracted from checkpoint: buddy_model_final.pt
"""

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class GPTConfig:
    block_size: int = 1024
    vocab_size: int = 50304
    n_layer: int = 12
    n_head: int = 12
    n_embd: int = 768


class RMSNorm(nn.Module):
    """Root Mean Square Layer Normalization."""
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x):
        norm = torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)
        return x * norm * self.weight


def precompute_freqs_cis(dim: int, end: int, theta: float = 10000.0):
    """Precompute the frequency tensor for rotary embeddings."""
    freqs = 1.0 / (theta ** (torch.arange(0, dim, 2)[: (dim // 2)].float() / dim))
    t = torch.arange(end, device=freqs.device)
    freqs = torch.outer(t, freqs)
    freqs_cis = torch.polar(torch.ones_like(freqs), freqs)  # complex64
    return freqs_cis


def apply_rotary_emb(xq, xk, freqs_cis):
    """Apply rotary embeddings to queries and keys."""
    xq_ = torch.view_as_complex(xq.float().reshape(*xq.shape[:-1], -1, 2))
    xk_ = torch.view_as_complex(xk.float().reshape(*xk.shape[:-1], -1, 2))
    freqs_cis = freqs_cis[:xq_.shape[1], :]  # trim to sequence length
    freqs_cis = freqs_cis[None, :, None, :]   # (1, seq, 1, head_dim//2)
    # Broadcast: (batch, seq, n_head, head_dim//2)
    xq_out = torch.view_as_real(xq_ * freqs_cis).flatten(3)
    xk_out = torch.view_as_real(xk_ * freqs_cis).flatten(3)
    return xq_out.type_as(xq), xk_out.type_as(xk)


class Attention(nn.Module):
    """Multi-head self-attention with RoPE."""
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.n_head = config.n_head
        self.head_dim = config.n_embd // config.n_head

        self.wq = nn.Linear(config.n_embd, config.n_embd, bias=False)
        self.wk = nn.Linear(config.n_embd, config.n_embd, bias=False)
        self.wv = nn.Linear(config.n_embd, config.n_embd, bias=False)
        self.wo = nn.Linear(config.n_embd, config.n_embd, bias=False)

    def forward(self, x, freqs_cis):
        B, T, C = x.size()

        q = self.wq(x).view(B, T, self.n_head, self.head_dim)
        k = self.wk(x).view(B, T, self.n_head, self.head_dim)
        v = self.wv(x).view(B, T, self.n_head, self.head_dim)

        # Apply rotary embeddings
        q, k = apply_rotary_emb(q, k, freqs_cis)

        # Transpose for attention: (B, n_head, T, head_dim)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)

        # Scaled dot-product attention with causal mask
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.head_dim))
        # Causal mask
        mask = torch.triu(torch.ones(T, T, device=x.device), diagonal=1).bool()
        att = att.masked_fill(mask[None, None, :, :], float('-inf'))
        att = F.softmax(att, dim=-1)

        y = att @ v  # (B, n_head, T, head_dim)
        y = y.transpose(1, 2).contiguous().view(B, T, C)

        return self.wo(y)


class FeedForward(nn.Module):
    """Standard 2-layer MLP with GELU activation."""
    def __init__(self, config: GPTConfig):
        super().__init__()
        hidden_dim = 4 * config.n_embd
        self.net = nn.Sequential(
            nn.Linear(config.n_embd, hidden_dim, bias=False),
            nn.GELU(),
            nn.Linear(hidden_dim, config.n_embd, bias=False),
        )

    def forward(self, x):
        return self.net(x)


class TransformerBlock(nn.Module):
    """A single transformer block with pre-norm (RMSNorm)."""
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.attention = Attention(config)
        self.feed_forward = FeedForward(config)
        self.attention_norm = RMSNorm(config.n_embd)
        self.ffn_norm = RMSNorm(config.n_embd)

    def forward(self, x, freqs_cis):
        x = x + self.attention(self.attention_norm(x), freqs_cis)
        x = x + self.feed_forward(self.ffn_norm(x))
        return x


class GPT(nn.Module):
    """LLaMA-style GPT model."""
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.config = config

        self.tok_embeddings = nn.Embedding(config.vocab_size, config.n_embd)
        self.layers = nn.ModuleList([TransformerBlock(config) for _ in range(config.n_layer)])
        self.norm = RMSNorm(config.n_embd)
        self.output = nn.Linear(config.n_embd, config.vocab_size, bias=False)

        # Precompute RoPE frequencies
        head_dim = config.n_embd // config.n_head
        self.freqs_cis = precompute_freqs_cis(head_dim, config.block_size)

    def forward(self, idx, targets=None):
        B, T = idx.size()
        assert T <= self.config.block_size, f"Sequence length {T} exceeds block_size {self.config.block_size}"

        x = self.tok_embeddings(idx)

        # Move freqs_cis to the same device as x
        freqs_cis = self.freqs_cis.to(x.device)

        for layer in self.layers:
            x = layer(x, freqs_cis)

        x = self.norm(x)
        logits = self.output(x)

        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))

        return logits, loss
