"""FastAPI app exposing Twilio voice webhooks.

Endpoints
---------
POST /voice/inbound  — answer a call; greet + <Gather input="speech">
POST /voice/gather   — speech result -> Agent -> <Say> + gather again
POST /voice/status   — call status callback (logging only)
GET  /health         — liveness

Architecture note
-----------------
This showcase uses Twilio's <Gather input="speech"> + <Say> turn-taking.
A production voice agent would instead use Twilio Media Streams (WebSocket)
plus realtime STT/TTS (or the Grok Voice Agent / Realtime API) for
full-duplex, sub-second barge-in conversations. See the README.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Form, Request, Response

from charlie.agent import Agent

logger = logging.getLogger("charlie.telephony")

app = FastAPI(title="Charlie-Agent Telephony", version="0.1.0")

# In-memory agents keyed by CallSid. Fine for a single-process demo;
# production would use Redis / a durable session store.
_SESSIONS: dict[str, Agent] = {}


def _twiml(body: str) -> Response:
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>'
    return Response(content=xml, media_type="application/xml")


def _get_agent(call_sid: str, from_number: str) -> Agent:
    if call_sid not in _SESSIONS:
        caller = from_number or call_sid or "unknown"
        _SESSIONS[call_sid] = Agent(caller_id=caller)
    return _SESSIONS[call_sid]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "charlie-agent"}


@app.post("/voice/inbound")
async def voice_inbound(
    CallSid: str = Form(default=""),
    From: str = Form(default=""),
) -> Response:
    """Answer inbound (or outbound-connected) calls."""
    agent = _get_agent(CallSid, From)
    logger.info("inbound call sid=%s from=%s", CallSid, From)
    # Greet once, then gather speech.
    greet = (
        "Hi, this is Charlie, your AI phone agent. "
        "How can I help you today?"
    )
    # Seed history so the agent knows it already greeted.
    agent.messages.append({"role": "assistant", "content": greet})
    body = (
        f"<Say>{_escape(greet)}</Say>"
        '<Gather input="speech" action="/voice/gather" method="POST" '
        'speechTimeout="auto" timeout="5">'
        "</Gather>"
        "<Say>I did not hear anything. Goodbye.</Say>"
        "<Hangup/>"
    )
    return _twiml(body)


@app.post("/voice/gather")
async def voice_gather(
    CallSid: str = Form(default=""),
    From: str = Form(default=""),
    SpeechResult: str = Form(default=""),
) -> Response:
    """Handle one speech turn and keep the gather loop going."""
    agent = _get_agent(CallSid, From)
    user_text = (SpeechResult or "").strip()
    logger.info("gather sid=%s speech=%r", CallSid, user_text)

    if not user_text:
        reply = "Sorry, I did not catch that."
    elif user_text.lower() in {"goodbye", "bye", "hang up", "end call"}:
        return _twiml(f"<Say>{_escape('Goodbye!')}</Say><Hangup/>")
    else:
        reply = agent.handle_user_message(user_text)

    # Keep replies short for TTS.
    spoken = reply if len(reply) < 500 else reply[:480] + "..."
    body = (
        f"<Say>{_escape(spoken)}</Say>"
        '<Gather input="speech" action="/voice/gather" method="POST" '
        'speechTimeout="auto" timeout="5">'
        "</Gather>"
        "<Say>Thanks for calling Charlie. Goodbye.</Say>"
        "<Hangup/>"
    )
    return _twiml(body)


@app.post("/voice/status")
async def voice_status(request: Request) -> dict[str, Any]:
    """Twilio status callback — log and acknowledge."""
    form = await request.form()
    sid = form.get("CallSid")
    status = form.get("CallStatus")
    logger.info("status sid=%s status=%s", sid, status)
    if status in {"completed", "busy", "failed", "no-answer", "canceled"} and sid:
        _SESSIONS.pop(str(sid), None)
    return {"ok": True}


def _escape(text: str) -> str:
    """Minimal XML escaping for TwiML <Say> bodies."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
