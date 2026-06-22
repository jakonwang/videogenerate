# Hermes Live Photo Integration

## Goal

This integration layer allows an external messaging channel to drive the Live Photo workflow:

1. User sends one or more reference images from a phone
2. Hermes creates a Live Photo session
3. Hermes returns product options
4. User selects a product
5. Hermes starts Live Photo generation
6. Hermes returns generation status and a final video result

Current channel adapters:

- Feishu app style adapter
- WeCom app style adapter

## Current Status

The repository already contains:

- Session orchestration: `src/main/modules/live-photo/hermes.ts`
- Channel adapters: `src/main/modules/live-photo/hermesAdapters.ts`
- IPC bridge: `src/main/ipc/registerHermesLivePhotoIpc.ts`
- HTTP endpoints: `src/main/modules/web-platform/webApiRouter.ts`
- Smoke test: `test/live-photo-hermes.smoke.ts`

The current implementation is channel-ready but not yet bound to official Feishu or WeCom signed event payloads.

## HTTP Endpoints

### Start Session

`POST /hermes/live-photo/session/start`

Request:

```json
{
  "channel": "feishu",
  "userId": "user-123",
  "referenceImagePaths": [
    "D:\\\\assets\\\\ref-1.jpg"
  ]
}
```

Response:

```json
{
  "ok": true,
  "session": {
    "id": "session-id",
    "channel": "feishu",
    "userId": "user-123",
    "status": "awaiting_product",
    "referenceImagePaths": [
      "D:\\assets\\ref-1.jpg"
    ],
    "livePhotoItemIds": [],
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000
  },
  "products": [
    {
      "id": "product-id",
      "name": "Demo Product",
      "type": "general",
      "coverImagePath": "D:\\assets\\product.jpg"
    }
  ],
  "message": "Reference image received. Please choose a product."
}
```

### Select Product

`POST /hermes/live-photo/session/select-product`

Request:

```json
{
  "sessionId": "session-id",
  "productId": "product-id"
}
```

Response:

```json
{
  "ok": true,
  "session": {
    "id": "session-id",
    "status": "processing"
  },
  "message": "Product selected. Live Photo generation started."
}
```

### Query Session

`GET /hermes/live-photo/session/{sessionId}`

Response:

```json
{
  "ok": true,
  "session": {
    "id": "session-id",
    "status": "completed",
    "generatedVideoPath": "D:\\data\\plugin-live-photo\\session\\preview.mp4"
  },
  "items": [],
  "completed": true
}
```

### Media Delivery

`GET /hermes/live-photo/media?path={absolute-file-path}`

This endpoint streams the final media file over HTTP with range support.

It is intended for:

- phone playback on the same LAN
- temporary delivery before the channel-specific media upload step is added

### Send Final Result To Feishu

`POST /hermes/live-photo/feishu/send-final`

Request:

```json
{
  "sessionId": "session-id",
  "userId": "feishu-user-1",
  "receiveId": "ou_xxx",
  "receiveIdType": "open_id",
  "tenantAccessToken": "optional-pre-fetched-token",
  "appId": "optional-app-id",
  "appSecret": "optional-app-secret"
}
```

Behavior:

- sends a text status message first
- uploads the final video file to Feishu
- sends the uploaded file message

### Send Final Result To WeCom

`POST /hermes/live-photo/wecom/send-final`

Request:

```json
{
  "sessionId": "session-id",
  "userId": "wecom-user-1",
  "toUser": "zhangsan",
  "agentId": "1000002",
  "accessToken": "optional-pre-fetched-token",
  "corpId": "optional-corp-id",
  "corpSecret": "optional-corp-secret"
}
```

Behavior:

- sends a text status message first
- uploads the final video file to WeCom temporary media storage
- sends the uploaded file message

## Adapter Webhooks

### Feishu Adapter

`POST /hermes/live-photo/feishu/webhook`

Current request contract:

```json
{
  "userId": "feishu-user-1",
  "imagePaths": [
    "D:\\assets\\reference.jpg"
  ],
  "text": "",
  "sessionId": ""
}
```

### WeCom Adapter

`POST /hermes/live-photo/wecom/webhook`

Current request contract:

```json
{
  "userId": "wecom-user-1",
  "imagePaths": [
    "D:\\assets\\reference.jpg"
  ],
  "text": "",
  "sessionId": ""
}
```

## Adapter Reply Actions

Adapters return a normalized action list.

### Product Options

```json
{
  "ok": true,
  "actions": [
    {
      "type": "product_options",
      "sessionId": "session-id",
      "text": "Please choose a product by replying with the product ID:\nproduct-id - Demo Product (general)",
      "options": [
        {
          "id": "product-id",
          "label": "Demo Product (general)"
        }
      ]
    }
  ]
}
```

### Processing Status

```json
{
  "ok": true,
  "actions": [
    {
      "type": "text",
      "text": "Live Photo is still processing."
    }
  ]
}
```

### Final Video

```json
{
  "ok": true,
  "actions": [
    {
      "type": "video",
      "text": "Your Live Photo video is ready.",
      "videoPath": "D:\\data\\plugin-live-photo\\session\\preview.mp4",
      "videoUrl": "http://192.168.1.8:47960/hermes/live-photo/media?path=D%3A%5Cdata%5Cplugin-live-photo%5Csession%5Cpreview.mp4"
    }
  ]
}
```

## What Is Still Missing

To fully complete phone-to-channel delivery for production use, the next layer must be added:

### Feishu

- Verify official callback signature
- Parse official event payload
- Download image media from Feishu into local temporary paths
- Optional: replace current file-message delivery with richer card or native video presentation

### WeCom

- Verify official callback signature or callback token
- Parse official event payload
- Download image media from WeCom into local temporary paths
- Optional: replace current file-message delivery with richer structured messaging

## Suggested Integration Strategy

1. Keep the current normalized adapter contract unchanged
2. Add one outer translator per platform:
   - official platform event -> normalized adapter input
   - normalized adapter actions -> official platform reply
3. Keep Live Photo generation orchestration inside `hermes.ts`
4. Keep platform-specific logic outside the Live Photo service

## Verification

Current verified evidence:

- `npm run typecheck`
- `npm run test:live-photo-hermes`

The smoke test proves:

- session creation works
- product selection works
- Live Photo generation is started by Hermes session logic
- final completion state is returned
- adapter returns a `video` action when done
