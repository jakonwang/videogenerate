---
name: feishu-live-photo
description: "Handle Feishu Live Photo customer flow by forwarding image and text events to a local VideoGenerate desktop app, returning numbered product options, starting generation from numeric replies, polling session status, and sending the final video back to the same Feishu user."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [Feishu, Live-Photo, VideoGenerate, Desktop, Automation]
    related_skills: [webhook-subscriptions, hermes-agent]
prerequisites:
  commands: [node, curl]
---

# Feishu Live Photo

Use this skill when Hermes needs to run the Feishu customer support flow for the local VideoGenerate desktop app.

## When to Use

- User wants Hermes to receive Feishu messages and drive local Live Photo generation
- User sends a reference image in Feishu and expects product options
- User replies with a number like `1`, `2`, or `3` to choose a product
- Hermes needs to send the final generated video back to the same Feishu user
- User says phrases like "use feishu live photo", "run live photo flow", "process this Feishu image as a live photo order", or "start the Feishu product selection flow"

## When NOT to Use

- The task is not about Feishu message forwarding
- The desktop app is not running locally
- The user wants image plus video delivery in the same change

## Prerequisites

- VideoGenerate desktop app is running on the same Windows machine
- Hermes can call the local desktop HTTP API
- Feishu credentials are configured in Hermes Channels -> Feishu
- Hermes knows the local desktop base URL, for example `http://127.0.0.1:19080`

## Skill Assets

- Script: `scripts/feishu_live_photo.js`
- Config template: `templates/config.example.json`

## Required Endpoints

Use these local desktop endpoints:

- `POST /hermes/live-photo/feishu/official-event`
- `GET /hermes/live-photo/session/{sessionId}`

## Quick Start

1. Copy `templates/config.example.json` to your own config file
2. Fill in `baseUrl`
3. Optional: change `downloadDir`
4. Configure Feishu credentials in Hermes Channels -> Feishu
5. Start the VideoGenerate desktop app on the same machine
6. Use the script to forward Feishu events and send the final video

Example config:

```json
{
  "baseUrl": "http://127.0.0.1:47960",
  "receiveIdType": "open_id",
  "downloadDir": "C:\\Users\\Administrator\\AppData\\Local\\Temp\\hermes-feishu-live-photo"
}
```

## Trigger Prompt

When you want Hermes to load this skill from chat text, use a direct prompt like this:

```text
Use the feishu-live-photo skill. Treat this Feishu message as a Live Photo customer order. If the message contains an image, start a new Live Photo session, return numbered product options, wait for the customer's numeric reply, then continue until the final video is ready and send it back to the same Feishu user.
```

Shorter trigger prompt:

```text
Use feishu-live-photo to handle this Feishu Live Photo flow.
```

## Script Commands

### Forward a Feishu event

```bash
node scripts/feishu_live_photo.js event --config templates/config.example.json --event-file event.json
```

### Query session status

```bash
node scripts/feishu_live_photo.js status --config templates/config.example.json --session-id session-id
```

### Send final video to Feishu

```bash
node scripts/feishu_live_photo.js send-final --config templates/config.example.json --session-id session-id --receive-id ou_xxx
```

### Full automatic flow for one image event

This command downloads the Feishu image inside Hermes, forwards the local image path to VideoGenerate, polls until generation completes, then uploads and sends the final video from Hermes.

```bash
node scripts/feishu_live_photo.js auto --config templates/config.example.json --event-file event.json
```

## Message Forwarding Flow

### 1. Customer sends a reference image

Forward the Feishu official event JSON to:

```bash
node scripts/feishu_live_photo.js event --config templates/config.example.json --event-file event.json
```

Expected result:

- Hermes downloads the image locally
- A Live Photo session is created in VideoGenerate
- Hermes receives `replies`
- The first reply contains numbered product options

### 2. Hermes sends product options back to the customer

Send the returned `replies` text to Feishu as-is.

The customer will see something like:

```text
Please choose a product by replying with its number:
1. Product A
2. Product B
3. Product C
```

### 3. Customer replies with a number

When the customer replies with `1`, `2`, `3`, and so on, forward that new Feishu text event to the same endpoint:

```bash
node scripts/feishu_live_photo.js event --config templates/config.example.json --event-file reply-event.json
```

Behavior:

- The desktop app finds the latest `awaiting_product` session for that Feishu user
- The numeric reply is mapped to the presented product order
- Live Photo generation starts automatically

### 4. Query status

If Hermes stored the `sessionId`, query status directly:

```bash
node scripts/feishu_live_photo.js status --config templates/config.example.json --session-id <sessionId>
```

Use this when:

- The customer asks whether the task is finished
- Hermes needs to decide whether to call final delivery

### 5. Send final video back to the same Feishu user

When session status is completed, call:

```bash
node scripts/feishu_live_photo.js send-final --config templates/config.example.json --session-id <sessionId> --receive-id <open_id>
```

Behavior:

- Hermes sends a text message first
- Hermes uploads the generated video to Feishu
- Hermes sends the final video file to the customer

## Event Requirements

For Feishu image events, preserve these fields when forwarding:

- `event.sender.sender_id.open_id`
- `event.message.message_id`
- `event.message.message_type`
- `event.message.content`

For text replies, preserve:

- `event.sender.sender_id.open_id`
- `event.message.message_type`
- `event.message.content`

## Rules

1. Hermes owns Feishu app credentials for this workflow
2. Prefer Hermes channel settings as the source of Feishu credentials
3. Hermes should download Feishu images before forwarding image events to VideoGenerate
4. Do not manually resolve product numbers inside Hermes if the desktop app can do it
5. Treat `session=...` without `product=...` as a status query, not a selection
6. Keep final delivery video-only for this workflow
