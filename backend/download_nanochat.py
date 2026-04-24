from pathlib import Path

from huggingface_hub import hf_hub_download


REPO_ID = "sdobson/nanochat"
FILES = [
    "model_000650.pt",
    "meta_000650.json",
    "tokenizer.pkl",
]


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    model_root = project_root / "model"
    nanochat_dir = model_root / "nanochat"
    model_root.mkdir(parents=True, exist_ok=True)
    nanochat_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading files from {REPO_ID}...")
    for filename in FILES:
        downloaded = Path(
            hf_hub_download(
                repo_id=REPO_ID,
                filename=filename,
                local_dir=str(model_root),
                local_dir_use_symlinks=False,
            )
        )

        if filename == "model_000650.pt":
            target = model_root / filename
        else:
            target = nanochat_dir / filename

        if downloaded != target:
            target.write_bytes(downloaded.read_bytes())
        print(f"  ready: {target}")

    print("Done. You can now run the backend with model='nanochat'.")


if __name__ == "__main__":
    main()
