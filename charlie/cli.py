"""Charlie-Agent command-line entrypoints.

Usage:
  python -m charlie.cli serve          # FastAPI / Twilio webhooks
  python -m charlie.cli call +1...     # place outbound call
  python -m charlie.cli chat           # text REPL (no telephony)
"""

from __future__ import annotations

import argparse
import sys


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from charlie.telephony.twilio_server import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def cmd_call(args: argparse.Namespace) -> int:
    from charlie.telephony.outbound import TwilioNotConfigured, place_outbound_call

    try:
        result = place_outbound_call(args.number)
    except TwilioNotConfigured as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"error placing call: {exc}", file=sys.stderr)
        return 1
    print(f"Call started: sid={result.get('sid')} status={result.get('status')}")
    return 0


def cmd_chat(args: argparse.Namespace) -> int:
    """Interactive text REPL — great for testing the agent loop offline."""
    from charlie.agent import Agent
    from charlie.config import get_settings
    from charlie.llm import LLMConfigError

    settings = get_settings()
    print("Charlie-Agent text chat. Type 'quit' or Ctrl-D to exit.")
    if not settings.has_llm_key:
        print(
            "NOTE: XAI_API_KEY is not set — replies will be a graceful "
            "offline message until you configure .env."
        )
    agent = Agent(caller_id=args.caller or "cli-user")
    # Probe once so a missing key fails fast and clearly.
    try:
        from charlie.llm import LLMClient

        LLMClient(settings).ensure_ready()
    except LLMConfigError as exc:
        print(f"\n{exc}\n")
        if args.require_llm:
            return 1
        print("Continuing in degraded mode (each turn will remind you).\n")

    while True:
        try:
            user = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nbye.")
            return 0
        if not user:
            continue
        if user.lower() in {"quit", "exit", "bye"}:
            print("bye.")
            return 0
        reply = agent.handle_user_message(user)
        print(f"charlie> {reply}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="charlie", description="Charlie-Agent CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_serve = sub.add_parser("serve", help="Run the FastAPI Twilio webhook server")
    p_serve.add_argument("--host", default="0.0.0.0")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=cmd_serve)

    p_call = sub.add_parser("call", help="Place an outbound Twilio call")
    p_call.add_argument("number", help="E.164 destination, e.g. +15555550123")
    p_call.set_defaults(func=cmd_call)

    p_chat = sub.add_parser("chat", help="Text-only REPL for the agent loop")
    p_chat.add_argument("--caller", default="cli-user", help="Caller id for memory")
    p_chat.add_argument(
        "--require-llm",
        action="store_true",
        help="Exit non-zero if no API key is configured",
    )
    p_chat.set_defaults(func=cmd_chat)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
