---
name: feishu-live-photo
description: "Handle Feishu Live Photo and product material library selection flow. Trigger on phrases like 素材库, 选图, 商品选图, 未使用live photo, live photo, or Feishu Live Photo requests. Forward image and text events to a local VideoGenerate desktop app, return numbered product or material options, continue generation from the user's selection, and send the final video back to the same Feishu user."
version: 1.2.0
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

## Current Production Rules

Use these rules as the highest-priority behavior for the current production flow:

- 文本型素材库流程优先使用 `POST /hermes/live-photo/feishu/webhook`
- 图片事件和本地图片回放继续使用 `POST /hermes/live-photo/feishu/official-event`
- 当用户发送 `素材库`、`选图`、`商品选图`、`商品素材库`、`图片素材库` 时，必须直接返回商品编号列表
- 商品编号列表只能返回商品，不要混入分类，不要返回 `E-33 (ring)` 这种格式
- 用户回复商品编号后，再返回该商品对应的素材图编号列表
- 素材选择阶段必须支持 `删除2`、`删除 2`、`删除 2 5`
- 删除素材后，必须返回剩余素材编号列表，不要重置回商品编号列表
- 如果当前商品已经没有剩余素材，要明确提示用户当前商品无可用素材，并要求重新选商品
- 正常参考图 Live Photo 流程保持不变，仍然是先发图，再选商品

## When to Use

- User wants Hermes to receive Feishu messages and drive local Live Photo generation
- User sends a reference image in Feishu and expects product options
- User replies with a number like `1`, `2`, or `3` to choose a product
- User wants to use product material library mode without first sending a reference image
- Hermes needs to send the final generated video back to the same Feishu user
- User says phrases like "use feishu live photo", "run live photo flow", "process this Feishu image as a live photo order", or "start the Feishu product selection flow"

## Chinese Trigger Phrases

Treat these messages as direct action requests instead of generic chat:

- `素材库`
- `选图`
- `商品选图`
- `商品素材库`
- `图片素材库`
- `未使用live photo`
- `未使用视频`
- `未使用成品`
- `发送成品`
- `发送视频`
- `成品视频`

## Delivery Continuation Rules

When the current Feishu Live Photo session is already waiting for delivery quantity:

- Treat short replies like `1`, `2`, `all`, `send all`, `全部`, `全部发`, `都发`, `全发`, `全要`, and `都要` as direct workflow continuation
- Do not answer these continuation replies with general chat, tutorial text, or ordinary help text
- Forward these continuation replies directly to `POST /hermes/live-photo/feishu/webhook`
- Keep the reply in the current unused-live-photo delivery flow until the requested videos are sent

## Immediate Mode Switching Rules

When the inbound customer message is only a trigger phrase such as `素材库`, `选图`, `商品选图`, `商品素材库`, `图片素材库`, `未使用live photo`, `未使用视频`, `发送成品`, or `发送视频`, do not answer with a tutorial, product explanation, or general guidance.

Required behavior:

- Treat `素材库`, `选图`, `商品选图`, `商品素材库`, and `图片素材库` as an immediate request to enter product-material selection mode
- Treat `未使用live photo`, `未使用视频`, `未使用成品`, `发送成品`, `发送视频`, and `成品视频` as an immediate request to enter unused-live-photo delivery mode
- Do not explain the general Feishu Live Photo workflow when the user only sent one of these trigger phrases
- Do not respond with long instructions unless the user explicitly asks for help, tutorial, configuration, or integration guidance
- For material mode, immediately start the product selection flow and return the product-number list
- For delivery mode, immediately start the product selection flow and return the product-number list

Customer-facing output policy for these direct trigger phrases:

- `素材库` or equivalent:
  reply with `请选择商品编号，我会返回对应素材图供你选择。`
- `未使用live photo` or equivalent:
  reply with `请选择商品编号，我会返回可发送的未使用 Live Photo 视频。`

## When NOT to Use

- The task is not about Feishu message forwarding
- The desktop app is not running locally
- The user wants image plus video delivery in the same change

## Prerequisites

- VideoGenerate desktop app is running on the same Windows machine
- Hermes can call the local desktop HTTP API
- Feishu credentials are configured in Hermes Channels -> Feishu
- Hermes knows the local desktop base URL, for example `http://127.0.0.1:47960`

## Skill Assets

- Script: `scripts/feishu_live_photo.js`
- Config template: `templates/config.example.json`

## Required Endpoints

Use these local desktop endpoints:

- `POST /hermes/live-photo/feishu/webhook` for text-only product selection, material selection, material deletion, and unused-live-photo delivery mode
- `POST /hermes/live-photo/feishu/official-event` for real Feishu image events or normalized local image replay
- `GET /hermes/live-photo/session/{sessionId}`
- `POST /hermes/live-photo/session/select-product` with JSON body `{ "sessionId": "...", "productId": "..." }`
- `POST /hermes/live-photo/session/select-material` when an explicit material selection call is needed
- `POST /hermes/live-photo/feishu/send-final` for final delivery

## Quick Start

1. Copy `templates/config.example.json` to your own config file
2. Fill in `baseUrl`
3. Optional: change `downloadDir`
4. Configure Feishu credentials in Hermes Channels -> Feishu
5. Start the VideoGenerate desktop app on the same machine
6. Use the script to forward Feishu events, text messages, and final delivery

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

- Keep customer-facing replies short and action-oriented
- Reply in Chinese when the customer is using Chinese
- Do not explain internal implementation details such as `sessionId`, endpoint names, local cache paths, polling, or watcher processes
- Do not send long tutorial-style explanations by default
- Only tell the customer the next action they need to take right now

Preferred customer-facing patterns:

- If no reference image is available yet in normal mode: `请先发送参考图片。`
- After a new image session is created: `请选择商品编号：` followed by the numbered options
- In material-selection mode: `请先选择商品编号，我会返回该商品对应的素材图供你选择。`
- After product options are shown and the user needs to choose a material: `请选择图片编号。也可以直接回复 删除2 或 删除 2 5。`
- If the customer asks how to use the flow, give a short version only, for example: `先发图，我给你编号，你回编号后我开始生成。`

## Direct Chat-Image Flow

Use this path when the user sends an image directly in the current Hermes chat and the image is already available as a local Hermes cache file such as `C:\\Users\\Administrator\\AppData\\Local\\hermes\\profiles\\<profile>\\image_cache\\*.jpg`.

Workflow:

1. Build a minimal Feishu-style event payload that preserves `event.sender.sender_id.open_id`
2. Set `event.message.message_type` to `image`
3. Put the local cached image path into `event.message.content` as JSON with `image_paths`, not `image_key`
4. POST that payload directly to `POST /hermes/live-photo/feishu/official-event`
5. Read the returned `actions` and send the numbered product options back to the user

## Text-Only Material Flow

Use this path when the user is not sending a reference image and only wants to browse materials or delete material choices.

Workflow:

1. Send the user text to `POST /hermes/live-photo/feishu/webhook` with body `{ "userId": "<open_id>", "text": "<message>" }`
2. If the user sends `素材库`, return the product-number list
3. If the user replies with a product number, return the material-number list
4. If the user replies with `删除2` or `删除 2 5`, return the remaining material-number list
5. If the user replies with a material number, continue to generation

## Script Commands

### Forward a Feishu image or text event

```bash
node scripts/feishu_live_photo.js event --config templates/config.example.json --event-file event.json
```

### Send a text-only request directly

```bash
node scripts/feishu_live_photo.js text --config templates/config.example.json --user-id ou_xxx --text 素材库
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
