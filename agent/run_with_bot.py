#!/usr/bin/env python3
"""Run Tg-bot-ai's existing main.py and the control-panel agent in one service.

Copy this file and backup_agent.py to the bot repository root. The bot remains
its own process; a failing backup must never terminate Telegram polling.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


BOT_DIR = Path(__file__).resolve().parent
STOPPING = False


def stop(_signal: int, _frame: object) -> None:
    global STOPPING
    STOPPING = True


def terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main() -> int:
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    bot = subprocess.Popen([sys.executable, "main.py"], cwd=BOT_DIR)
    agent: subprocess.Popen | None = None
    next_agent_start = 0.0
    try:
        while not STOPPING and bot.poll() is None:
            site = os.environ.get("BACKUP_SITE", "").strip()
            key = os.environ.get("BACKUP_KEY", "").strip()
            if site and key and time.monotonic() >= next_agent_start and (agent is None or agent.poll() is not None):
                agent = subprocess.Popen(
                    [sys.executable, "backup_agent.py", "--storage", os.environ.get("SMARTEL_STORAGE_DIR", "/app/storage")],
                    cwd=BOT_DIR,
                )
                next_agent_start = time.monotonic() + 60
            if agent is not None and agent.poll() is not None:
                print(f"Backup agent exited ({agent.returncode}); retrying in 60 seconds", flush=True)
                agent = None
            time.sleep(2)
        return bot.poll() or 0
    finally:
        terminate(agent)
        terminate(bot)


if __name__ == "__main__":
    raise SystemExit(main())
