# Backend

This directory is now an offline inference backend, not a web API.

## Purpose

The backend owns:

- model loading
- prompt construction
- local reply generation
- model download utility

It does not own:

- auth
- Supabase
- FastAPI routes
- SQLite persistence

SQLite lives in the Next.js app because the frontend server actions are now the application layer.

## Files

- `cli.py`
  - canonical command-line entrypoint
  - reads JSON from stdin or a single prompt from `--prompt`
- `main.py`
  - thin wrapper around `cli.py` for compatibility
- `offline_inference.py`
  - compatibility wrapper used by the Next.js bridge
- `inference_core.py`
  - shared model registry and generation code
- `nanochat_runtime.py`
  - NanoChat runtime implementation
- `model_config.py`
  - GPT architecture for the local fine-tuned checkpoints
- `download_nanochat.py`
  - fetches the NanoChat weights and tokenizer into `model/`

## Usage

List models:

```bash
python backend/main.py --list-models
```

If `backend/.venv` exists, `main.py` and `offline_inference.py` will automatically re-exec with that interpreter.

Single prompt:

```bash
python backend/main.py --model nanochat --prompt "Say hello in one short sentence."
```

JSON over stdin:

```bash
echo '{"model":"nanochat","temperature":0.6,"history":[{"role":"user","content":"Hello"}]}' | python backend/main.py
```

## Dependencies

Install from `requirements.txt` or `pyproject.toml`.

Required packages are limited to local inference and model download:

- `torch`
- `tiktoken`
- `huggingface_hub`

## Notes

- `offline_inference.py` is kept because the Next.js app already calls it.
- `main.py` no longer starts a server; it is now a CLI entrypoint.
- The old Supabase/FastAPI backend has been removed from the active code path.
