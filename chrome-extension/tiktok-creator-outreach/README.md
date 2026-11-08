# TikTok Creator Outreach

This unpacked Chrome extension is retained only as a legacy page helper. The Electron TikTok Creator Outreach workspace now uses the official TikTok Shop Affiliate Seller API as its execution engine.

## Install

1. Open `chrome://extensions` and enable Developer mode.
2. Choose Load unpacked and select this directory.
3. Open the signed-in Affiliate page in Chrome and click the extension action to open the side panel.

## Workflow

- Save reusable invite or message plans in the side panel.
- Set a target larger than 50. The queue splits it into official batches of at most 50 (for example 135 becomes 50, 50, 35).
- Auto scan uses the page's internal scroll container and visible pagination controls. It removes duplicate, already invited, and already collaborating creators when those states are visible.
- Invite mode opens the official target invitation create page and submits one official invitation per batch after one full-run confirmation.
- Message mode opens `seller/im`, searches each creator, and sends sequentially because TikTok does not provide a multi-select message control.
- Pause, resume, cancel, and retry failed creators are available in the execution panel. Rate limits, expired sessions, missing controls, and route changes pause the run.

The extension does not read, export, or store cookies and does not call private TikTok APIs. It is not used for production invite or message execution. Configure the Partner Center App and authorize shops from the Electron workspace instead.
