---
name: feishu-live-photo
description: "Handle Feishu Live Photo and product material library selection flow. Trigger on phrases like 素材库, 选图, 商品选图, 未使用live photo, live photo, or Feishu Live Photo requests. Forward image and text events to a local VideoGenerate desktop app, return numbered product or material options, continue generation from the user's selection, and send the final video back to the same Feishu user."
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
- User says Chinese trigger phrases such as `素材库`, `选图`, `商品选图`, `商品素材库`, `未使用live photo`, `未使用视频`, or `发送成品`

## Chinese Trigger Phrases

Treat these messages as direct requests to use this skill instead of handling them as generic chat:

- `素材库`
- `选图`
- `商品选图`
- `商品素材库`
- `图片素材库`
- `未使用live photo`
- `未使用视频`
- `发送成品`
- `发送视频`
- `live photo`

## Immediate Mode Switching Rules

When the inbound customer message is only a trigger phrase such as `素材库`, `选图`, `商品选图`, `商品素材库`, `图片素材库`, `未使用live photo`, `未使用视频`, `发送成品`, or `发送视频`, do not answer with a tutorial, product explanation, or general guidance.

Required behavior:

- Treat `素材库`, `选图`, `商品选图`, `商品素材库`, and `图片素材库` as an immediate request to enter product-material selection mode.
- Treat `未使用live photo`, `未使用视频`, `发送成品`, and `发送视频` as an immediate request to enter unused-live-photo delivery mode.
- Do not explain the general Feishu Live Photo workflow when the user only sent one of these trigger phrases.
- Do not respond with documentation, examples, numbered usage instructions, or developer integration notes unless the user explicitly asks for教程, 帮助, 用法, 配置, 接入, or 开发说明.
- For material mode, immediately start the material-selection flow and return the product-number list for the user to choose from.
- For delivery mode, immediately start the unused-live-photo delivery flow and return the product-number list for the user to choose from.

Customer-facing output policy for these direct trigger phrases:

- `素材库` or equivalent:
  reply with `请选择商品编号，我会返回对应素材图供你选择。`
- `未使用live photo` or equivalent:
  reply with `请选择商品编号，我会返回可发送的未使用 Live Photo 视频。`

These direct trigger phrases are action requests, not help requests.

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

## Customer-Facing Reply Policy

When this skill is used in a real customer chat, do not expose internal workflow details unless the user explicitly asks for them.

Required behavior:

- Keep customer-facing replies short and action-oriented.
- Reply in Chinese when the customer is using Chinese.
- Do not explain internal implementation details such as `sessionId`, explicit endpoint names, webhook flow, synthetic events, local cache paths, polling, watchers, or script commands.
- Do not send long "usage tutorial" style explanations by default.
- Do not describe the full multi-step backend workflow unless the user explicitly asks how the system works.
- Only tell the customer the next action they need to take right now.

Preferred customer-facing patterns:

- If no reference image is available yet: `请先发送参考图片。`
- After a new image session is created: `请选择商品编号：` followed by the numbered options.
- In material-selection mode: `请选择商品编号，我会返回对应素材图供你选择。`
- After product options are shown and the user needs to choose a material: `请选择图片编号。`
- If the customer asks how to use the flow, give a short version only, for example: `先发参考图，我会给你可选编号，你回复编号后我开始生成。`

Internal rules in this skill are for Hermes decision-making only. They are not default customer-facing copy.

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
