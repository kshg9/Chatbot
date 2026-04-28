from __future__ import annotations

import argparse
import json
import sys

from inference_core import DEVICE, generate_reply, list_models


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Offline model inference CLI for the local chatbot backend."
    )
    parser.add_argument("--list-models", action="store_true", help="Print the available model ids and exit.")
    parser.add_argument("--model", default="nanochat", help="Model id to use.")
    parser.add_argument("--temperature", type=float, default=0.6, help="Sampling temperature.")
    parser.add_argument("--max-tokens", type=int, default=160, help="Maximum generated tokens.")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Start a simple local REPL for manual model testing.",
    )
    parser.add_argument(
        "--prompt",
        help="Single user message. If omitted, stdin is treated as JSON payload.",
    )
    return parser.parse_args()


def run_interactive(args: argparse.Namespace) -> None:
    history: list[dict[str, str]] = []
    print(f"Offline backend interactive mode on {DEVICE}.")
    print(f"Model: {args.model} | temperature: {args.temperature} | max tokens: {args.max_tokens}")
    print("Type a prompt and press Enter. Type /reset to clear history. Type /exit to quit.")

    while True:
        try:
            prompt = input("you> ").strip()
        except EOFError:
            print()
            return

        if not prompt:
            continue
        if prompt in {"/exit", "/quit"}:
            return
        if prompt == "/reset":
            history = []
            print("history cleared")
            continue

        history.append({"role": "user", "content": prompt})
        reply = generate_reply(
            model_id=args.model,
            history=history,
            temperature=args.temperature,
            max_new_tokens=args.max_tokens,
        )
        history.append({"role": "assistant", "content": reply})
        print(f"model> {reply}")


def main() -> None:
    args = parse_args()

    if args.list_models:
        json.dump({"device": DEVICE, "models": list_models()}, sys.stdout)
        sys.stdout.write("\n")
        return

    if args.interactive:
        run_interactive(args)
        return

    if args.prompt is not None:
        history = [{"role": "user", "content": args.prompt}]
        payload = {
            "model": args.model,
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "history": history,
        }
    else:
        if sys.stdin.isatty():
            print(
                "No input provided. This backend is a CLI, not a long-running server.\n"
                "Use one of these:\n"
                "  uv run main.py --interactive\n"
                "  uv run main.py --prompt \"Hello\"\n"
                "  uv run main.py --list-models",
                file=sys.stderr,
            )
            raise SystemExit(2)
        payload = json.load(sys.stdin)

    reply = generate_reply(
        model_id=payload.get("model", "nanochat"),
        history=payload.get("history", []),
        temperature=float(payload.get("temperature", 0.6)),
        max_new_tokens=payload.get("max_tokens"),
    )

    json.dump({"reply": reply}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
