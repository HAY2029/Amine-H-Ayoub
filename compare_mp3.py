from pathlib import Path

import internetarchive as ia

TARGET_DIR = Path(r"H:\Amine_Audio")
ITEM_NAME = "quran-audio-files-for-kids"


def main():
    local = {p.name: p for p in TARGET_DIR.iterdir()
             if p.is_file() and p.suffix.lower() == ".mp3"}

    item = ia.get_item(ITEM_NAME)
    server = {f.name: f.md5 for f in item.get_files() if f.name.lower().endswith(".mp3")}

    missing = sorted(set(local) - set(server))
    extra = sorted(set(server) - set(local))
    mismatched = []
    for name in sorted(set(local) & set(server)):
        if file_md5(local[name]) != server[name]:
            mismatched.append(name)

    print(f"Local MP3 files:  {len(local)}")
    print(f"Server MP3 files: {len(server)}")
    print()

    if missing:
        print("Missing on server:")
        for name in missing:
            print(f"  - {name}")
    if mismatched:
        print("Content differs (MD5 mismatch):")
        for name in mismatched:
            print(f"  - {name}")
    if extra:
        print("On server but not local:")
        for name in extra:
            print(f"  - {name}")

    if not (missing or mismatched):
        print("OK: every local MP3 is on the server with identical content.")
    return 0 if not (missing or mismatched) else 1


def file_md5(path):
    import hashlib
    digest = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
