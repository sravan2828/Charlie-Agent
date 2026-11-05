"""Place an outbound phone call via the Twilio REST API.

The call connects to our /voice/inbound webhook so Charlie can speak
and gather speech turns. Requires TWILIO_* env vars and a reachable
PUBLIC_BASE_URL.
"""

from __future__ import annotations

from typing import Any

from charlie.config import Settings, get_settings


class TwilioNotConfigured(RuntimeError):
    """Raised when Twilio credentials are missing or still placeholders."""


def place_outbound_call(
    to_number: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Start an outbound call. Returns Twilio call metadata (sid, status)."""
    settings = settings or get_settings()
    if not settings.has_twilio:
        raise TwilioNotConfigured(
            "Twilio is not configured. Set TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env "
            "(see .env.example). Do not commit real credentials."
        )

    # Import lazily so the rest of Charlie works without Twilio installed
    # only for unit tests that never touch telephony — but Twilio is in
    # requirements.txt, so this is mainly for clarity.
    from twilio.rest import Client  # type: ignore

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    webhook = settings.public_base_url.rstrip("/") + "/voice/inbound"
    status_cb = settings.public_base_url.rstrip("/") + "/voice/status"

    call = client.calls.create(
        to=to_number,
        from_=settings.twilio_phone_number,
        url=webhook,
        method="POST",
        status_callback=status_cb,
        status_callback_event=["initiated", "ringing", "answered", "completed"],
        status_callback_method="POST",
    )
    return {"sid": call.sid, "status": call.status, "to": to_number}
