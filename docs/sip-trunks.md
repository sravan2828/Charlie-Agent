# Adding phone calls later (Plivo India and Twilio US)

The voice worker in `src/livekit/agent.js` already treats every LiveKit participant the same way. A browser user and a SIP caller both become a participant in a room. The worker classifies the participant only to pick a memory key (`sip` vs `webrtc`) and then calls the same brain. No telephony code has to move into the brain, the tool policy, or the Grok Voice adapter.

This file is the setup note for that later step. Nothing here is wired up yet. The existing Twilio Gather webhooks in `src/telephony/` stay as they are.

Official references:

- [LiveKit SIP trunk setup](https://docs.livekit.io/telephony/start/sip-trunk-setup/)
- [Twilio Elastic SIP trunk](https://docs.livekit.io/telephony/start/providers/twilio/)
- [Plivo SIP trunk (Zentrunk)](https://docs.livekit.io/telephony/start/providers/plivo/)
- [Dispatch rules](https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/)

Use the same LiveKit project as the web client (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). The worker must be running (`npm run voice`) and registered under `LIVEKIT_AGENT_NAME` (default `charlie`).

## What stays the same

1. Point the provider's trunk at your LiveKit SIP endpoint, usually `sip:<your-project>.sip.livekit.cloud;transport=tcp` (the project settings page shows the exact URI).
2. Create a LiveKit inbound trunk for the numbers you bought.
3. Create one dispatch rule that puts each caller in their own room and dispatches agent `charlie`.
4. For outbound calls later, create a LiveKit outbound trunk and place a SIP participant into a room. The same worker joins that room.

A dispatch rule that isolates callers and starts this worker looks like:

```json
{
  "name": "Charlie inbound",
  "rule": {
    "dispatch_rule_individual": {
      "room_prefix": "call-"
    }
  },
  "roomConfig": {
    "agents": [
      { "agentName": "charlie" }
    ]
  }
}
```

`agentName` must match `LIVEKIT_AGENT_NAME`. An individual rule gives each call its own room, so two callers do not hear each other. Create the rule once and reuse it; do not create a new rule per call.

The worker reads `sip.phoneNumber` (and SIP participant kind) to choose the memory file. Tool allowlists and confirmation do not change based on SIP versus the browser.

## Twilio US

Twilio Elastic SIP Trunking is the US path. Keep the current Twilio account if you already use it for Gather webhooks; the SIP trunk is a separate route into LiveKit and does not replace `src/telephony/twilioServer.js`.

Inbound:

1. In Twilio, create an Elastic SIP trunk.
2. Buy or move a US number onto that trunk.
3. On the trunk's Origination tab, set the Origination SIP URI to your LiveKit SIP URI with `;transport=tcp`.
4. In LiveKit, create an inbound trunk whose `numbers` list includes that E.164 number.
5. Attach the dispatch rule above (or restrict the rule to this trunk).

Outbound (when you want Charlie to dial out):

1. On the Twilio trunk, set a Termination SIP URI and credential list (username and password).
2. In LiveKit, create an outbound trunk with that termination domain, the same username and password, and the Twilio number as the caller ID.
3. From your own code (not written in this repo yet), use `SipClient.createSipParticipant` to dial an E.164 number into a room. The worker's entrypoint runs unchanged once the SIP participant appears.

Region: leave the trunk on Twilio's US routing. You can add a second origination URI later if you want a regional LiveKit SIP endpoint as a failover. Use priority, not weight, for failover order.

## Plivo India

Plivo Zentrunk is the India path. Indian numbers and termination stay on Plivo; LiveKit only sees SIP.

Inbound:

1. In the Plivo console (or the Zentrunk API), create an inbound trunk.
2. Set the primary URI to your LiveKit SIP endpoint.
3. Attach the Indian number you want Charlie to answer.
4. In LiveKit, create an inbound trunk listing that number in `numbers`.
5. Use the same style of individual dispatch rule and `agentName: "charlie"`. You can keep this trunk separate from the Twilio US trunk and point both at one rule, or use two rules if the numbers should be restricted per trunk.

Outbound:

1. Create a Plivo outbound credential. Plivo requires a username of 5–20 alphanumeric characters and a password of 5–20 characters that includes at least one character from `~!@#$%^&*()_+`.
2. Create the Plivo outbound trunk and note the termination SIP domain.
3. In LiveKit, create an outbound trunk with that domain, the Plivo username and password, and the Indian caller ID in `numbers`.
4. Dial with `createSipParticipant` the same way as Twilio. The room session is identical, so Grok Voice, the brain, and the confirmation hook do not get a second implementation.

India-specific caller ID, DLT registration, and call-time restrictions are Plivo account concerns. Configure those in Plivo before expecting outbound calls to connect. LiveKit does not replace that compliance step.

## Check that a call reached the worker

After the trunk and dispatch rule exist, call the number. The worker log line looks like:

```text
[charlie.voice] room=call-... transport=sip caller=+91...
```

A browser session from `web/index.html` logs `transport=webrtc` instead. Both lines come from `classifyParticipant` in `src/livekit/participant.js`. If the call rings but the worker never logs, the dispatch rule is not naming agent `charlie`, or the worker is not connected to the same LiveKit project.
