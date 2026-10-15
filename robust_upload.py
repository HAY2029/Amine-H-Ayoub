"""Upload MP3 files to Internet Archive with retries, MD5-based skipping, progress bars and clean Ctrl+C handling."""

import hashlib
import inspect
import logging
import socket
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import internetarchive as ia
from tqdm import tqdm

# ----------------------------- Settings -----------------------------
TARGET_DIR = Path(r"H:\Amine_Audio")
ITEM_NAME = "quran-audio-files-for-kids"
METADATA = {
    "mediatype": "audio",
    "title": "Quran Audio Files for Kids",
}

MAX_WORKERS = 2          # parallel uploads (2 is safer on weak internet)
MAX_RETRIES = 10         # upload attempts per file
FETCH_RETRIES = 5        # attempts to read the server's file list
REQUEST_TIMEOUT = 900    # seconds of silence before a connection is considered dead (15 min)
BASE_WAIT = 10           # first retry waits 10s, then 20s, 40s, ...
MAX_WAIT = 300           # ...but never more than 5 minutes
LOG_FILE = "upload_log.txt"

# HTTP errors that retrying cannot fix (bad credentials, bad request, not found)
PERMANENT_HTTP_CODES = {400, 401, 403, 404}

# ----------------------------- Setup -----------------------------
socket.setdefaulttimeout(REQUEST_TIMEOUT)

# Log to a file only. Console output is handled by the progress bars.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8")],
)
logger = logging.getLogger(__name__)


def log_console(msg, level=logging.INFO):
    """Print a message above the progress bars and also write it to the log file."""
    tqdm.write(msg)
    logger.log(level, msg)


stop_event = threading.Event()  # set on Ctrl+C so workers stop retrying


def _timeout_opts(func):
    """Pass a request timeout only if this version of internetarchive accepts one."""
    if "request_kwargs" in inspect.signature(func).parameters:
        return {"request_kwargs": {"timeout": REQUEST_TIMEOUT}}
    return {}


UPLOAD_OPTS = _timeout_opts(ia.upload)
GET_ITEM_OPTS = _timeout_opts(ia.get_item)


# ----------------------------- Helpers -----------------------------
def backoff(attempt):
    """Exponential wait: 10, 20, 40, ... capped at MAX_WAIT seconds."""
    return min(BASE_WAIT * 2 ** (attempt - 1), MAX_WAIT)


def file_md5(path):
    digest = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_permanent(exc):
    response = getattr(exc, "response", None)
    return response is not None and response.status_code in PERMANENT_HTTP_CODES


def read_server_md5s():
    """Return {filename: md5} for every file currently on Archive.org."""
    item = ia.get_item(ITEM_NAME, **GET_ITEM_OPTS)
    return {f.name: f.md5 for f in item.get_files()}


def fetch_server_md5s():
    for attempt in range(1, FETCH_RETRIES + 1):
        try:
            return read_server_md5s()
        except Exception as exc:
            log_console(f"Could not read server file list (attempt {attempt}/{FETCH_RETRIES}): {exc}",
                        logging.WARNING)
            if attempt < FETCH_RETRIES:
                time.sleep(backoff(attempt))
    raise RuntimeError("Could not read the server file list. Aborting so nothing is uploaded blindly.")


def already_on_server(name, local_md5):
    """True if the server already has this exact file (checked after a failed attempt)."""
    try:
        return read_server_md5s().get(name) == local_md5
    except Exception:
        return False


# ----------------------------- Upload logic -----------------------------
def upload_file(path, local_md5, bar):
    """Upload one file with retries. Returns True on success."""
    name = path.name

    for attempt in range(1, MAX_RETRIES + 1):
        if stop_event.is_set():
            return False
        bar.set_description(f"{name} (try {attempt}/{MAX_RETRIES})")
        try:
            responses = ia.upload(ITEM_NAME, files=[str(path)], metadata=METADATA,
                                  verbose=False, **UPLOAD_OPTS)
            for resp in responses or []:
                if resp is not None:
                    resp.raise_for_status()  # turn HTTP errors into exceptions
            log_console(f"[{name}] Uploaded successfully.")
            return True
        except Exception as exc:
            if is_permanent(exc):
                log_console(f"[{name}] Permanent error, not retrying: {exc}", logging.ERROR)
                return False
            log_console(f"[{name}] Attempt {attempt} failed: {exc}", logging.WARNING)

        if attempt == MAX_RETRIES:
            break

        # The connection may have dropped AFTER the server stored the file.
        if already_on_server(name, local_md5):
            log_console(f"[{name}] Already stored on server (MD5 matches). Done.")
            return True

        wait = backoff(attempt)
        bar.set_description(f"{name} (waiting {wait}s)")
        if stop_event.wait(wait):  # returns early if Ctrl+C was pressed
            return False

    log_console(f"[{name}] Failed after {MAX_RETRIES} attempts.", logging.ERROR)
    return False


def process_file(path, server_md5s, bar):
    """Skip or upload one file. Returns 'uploaded', 'skipped' or 'failed'."""
    name = path.name
    try:
        local_md5 = file_md5(path)
    except OSError as exc:
        log_console(f"[{name}] Cannot read file: {exc}", logging.ERROR)
        return "failed"

    if server_md5s.get(name) == local_md5:
        log_console(f"[{name}] Already on server with the same MD5. Skipping.")
        return "skipped"

    if name in server_md5s:
        log_console(f"[{name}] Different version on server. Re-uploading.")

    return "uploaded" if upload_file(path, local_md5, bar) else "failed"


# ----------------------------- Main -----------------------------
def main():
    if not TARGET_DIR.is_dir():
        logger.error("Directory not found: %s", TARGET_DIR)
        print(f"Directory not found: {TARGET_DIR}")
        return 1

    files = sorted(p for p in TARGET_DIR.iterdir()
                   if p.is_file() and p.suffix.lower() == ".mp3")
    if not files:
        print(f"No .mp3 files found in {TARGET_DIR}")
        return 0

    print(f"Found {len(files)} MP3 files. Reading the server file list...")
    try:
        server_md5s = fetch_server_md5s()
    except RuntimeError as exc:
        print(str(exc))
        logger.error(str(exc))
        return 1
    print(f"{len(server_md5s)} files already on the server.")

    counts = {"uploaded": 0, "skipped": 0, "failed": 0}
    failed_names = []

    # Overall progress bar (one step per file) at the bottom,
    # and one per-file bar for each worker is created by the upload itself.
    with tqdm(total=len(files), desc="Overall", unit="file", position=0) as overall:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            bars = {}
            futures = {}
            for i, p in enumerate(files):
                bar = tqdm(total=p.stat().st_size, unit="B", unit_scale=True,
                           desc=p.name, position=i % MAX_WORKERS + 1, leave=False)
                bars[p] = bar
                futures[executor.submit(process_file, p, server_md5s, bar)] = p

            try:
                for future in as_completed(futures):
                    path = futures[future]
                    try:
                        status = future.result()
                    except Exception as exc:
                        log_console(f"[{path.name}] Unexpected error: {exc}", logging.ERROR)
                        status = "failed"
                    bars[path].close()
                    counts[status] += 1
                    if status == "failed":
                        failed_names.append(path.name)
                    overall.update(1)
            except KeyboardInterrupt:
                log_console("Interrupted. Cancelling queued files; the current upload will finish.",
                            logging.WARNING)
                stop_event.set()
                for future in futures:
                    future.cancel()
                raise

    summary = (f"Done. Uploaded: {counts['uploaded']} | "
               f"Skipped: {counts['skipped']} | Failed: {counts['failed']}")
    print(summary)
    logger.info(summary)
    if failed_names:
        print("Failed files (run the script again to retry them):")
        for name in failed_names:
            print(f"  - {name}")
        logger.error("Failed files: %s", ", ".join(failed_names))
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Stopped. Run the script again later; uploaded files will be skipped.")
        sys.exit(130)
