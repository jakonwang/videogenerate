/**
 * Muse 创意室 texts: `中文 | English | Tiếng Việt`, keyed by the Chinese source text.
 * `{0}` are values. The second block are messages from the main process (errors and logs).
 */
const ROWS = `
账号的添加、登录、代理和额度查询请在电脑端操作，代理和登录信息不会离开电脑。|Add accounts, log in, set proxies and check quotas on the computer; proxies and logins never leave it.|Thêm tài khoản, đăng nhập, đặt proxy và xem hạn mức hãy làm trên máy tính; proxy và đăng nhập không rời khỏi máy.
首帧|Opening frame|Khung đầu
尾帧|Closing frame|Khung cuối
（用首帧放大）| (zoomed opening frame)| (phóng to khung đầu)
参考视频的首帧和尾帧都会换上商品，每条换图 2 次；尾帧失败时用首帧放大|The product is swapped into the clip's opening and closing frames (2 swaps per video); if the closing one fails, the opening frame is zoomed in|Sản phẩm được thay vào khung đầu và khung cuối của video mẫu (2 lần thay ảnh mỗi video); nếu khung cuối lỗi thì phóng to khung đầu
没有可以重做的尾帧|There is no closing frame to redo|Không có khung cuối để làm lại
尾帧换图失败：{0}，将用首帧放大作为尾帧|Closing frame swap failed: {0}; the zoomed opening frame will be used|Thay ảnh khung cuối lỗi: {0}; sẽ dùng khung đầu phóng to
尾帧换图一直没有结果，将用首帧放大作为尾帧|The closing frame swap never finished; the zoomed opening frame will be used|Thay ảnh khung cuối mãi không xong; sẽ dùng khung đầu phóng to
尾帧换图失败：{0}|Closing frame swap failed: {0}|Thay ảnh khung cuối lỗi: {0}
提交尾帧换图|Closing frame swap submitted|Đã gửi thay ảnh khung cuối
尾帧换图完成|Closing frame swap finished|Đã thay ảnh khung cuối
尾帧换图完成，等待确认|Closing frame swap finished, waiting for your approval|Đã thay ảnh khung cuối, chờ duyệt
商品细节图|Product detail pictures|Ảnh chi tiết sản phẩm
选择商品细节图|Choose product detail pictures|Chọn ảnh chi tiết sản phẩm
不用商品库图片|No library pictures|Không dùng ảnh thư viện
用商品库图片|Use library pictures|Dùng ảnh thư viện sản phẩm
上传细节图|Upload|Tải ảnh lên
请先在上面选择商品|Choose a product above first|Hãy chọn sản phẩm ở trên trước
可选。仍是每张参考图生成 1 条；这批每条都会带上这些图（最多 4 张），请只放同一个商品|Optional. Still 1 video per reference picture; every video of this batch also gets these pictures (up to 4), so use one product only|Tùy chọn. Vẫn mỗi ảnh mẫu tạo 1 video; mọi video trong lô đều kèm các ảnh này (tối đa 4), chỉ dùng ảnh của cùng một sản phẩm
可选。每个商品的视频各带自己的商品库图片，最多 4 张|Optional. Each product's video gets its own library pictures, up to 4|Tùy chọn. Video của mỗi sản phẩm kèm ảnh thư viện riêng, tối đa 4 ảnh
用于归类成片和提供细节图|Used to file the videos and provide detail pictures|Dùng để phân loại video và lấy ảnh chi tiết
细节图 {0} 张|{0} detail pictures|{0} ảnh chi tiết
用商品库图片需要先选择商品|Choose a product to use its library pictures|Cần chọn sản phẩm để dùng ảnh thư viện
商品「{0}」没有可用的图片|Product "{0}" has no usable picture|Sản phẩm "{0}" không có ảnh dùng được
有商品细节图不存在或不支持，只支持 40 MB 以内的 JPG、PNG、WebP|A detail picture is missing or unsupported; use JPG, PNG or WebP up to 40 MB|Có ảnh chi tiết không tồn tại hoặc không hỗ trợ; chỉ nhận JPG, PNG, WebP tối đa 40 MB
每条视频的图片合计不能超过 100 MB|Pictures of one video may not exceed 100 MB in total|Tổng ảnh của mỗi video không quá 100 MB
商品细节图最多 {0} 张|At most {0} detail pictures|Tối đa {0} ảnh chi tiết
账号管理|Accounts|Quản lý tài khoản
每个账号只通过自己的美国代理访问 Muse，代理不通就暂停|Each account reaches Muse only through its own US proxy and pauses when the proxy is down|Mỗi tài khoản chỉ vào Muse qua proxy Mỹ riêng, proxy lỗi thì tạm dừng
可用|Available|Dùng được
异常|Problem|Lỗi
已停用|Disabled|Đã tắt
关闭|Close|Đóng
搜索名称或 IP|Search name or IP|Tìm tên hoặc IP
全部|All|Tất cả
已启用|Enabled|Đang bật
会依次打开每个账号的 Muse 页面，不消耗额度|Opens each account's Muse page in turn; uses no quota|Lần lượt mở trang Muse của từng tài khoản, không tốn hạn mức
查询全部额度|Check all quotas|Xem mọi hạn mức
添加账号|Add account|Thêm tài khoản
本机安全存储不可用，无法保存代理和登录信息。|Secure storage is unavailable on this computer; proxies and logins cannot be saved.|Máy này không có kho bảo mật, không thể lưu proxy và đăng nhập.
提前|Move up|Đưa lên
推后|Move down|Đưa xuống
未设置代理|No proxy|Chưa đặt proxy
可达|reachable|vào được
不可达|unreachable|không vào được
出口 {0} · {1} · Muse {2}|Exit {0} · {1} · Muse {2}|IP ra {0} · {1} · Muse {2}
出口未检测|Exit not checked|Chưa kiểm tra IP ra
查询于 {0}|Checked {0}|Xem lúc {0}
本周已用|Used this week|Đã dùng tuần này
，{0} 重置|, resets {0}|, đặt lại {0}
 · 额外已用 {0}%{1}| · extra used {0}%{1}| · phần thêm đã dùng {0}%{1}
额度未查询|Quota not checked|Chưa xem hạn mức
额度不足|Out of quota|Hết hạn mức
后恢复，点检测可提前|resumes then; "Check" resumes earlier|sẽ dùng lại; bấm "Kiểm tra" để dùng sớm hơn
登录已保存|Login saved|Đã lưu đăng nhập
未登录|Not signed in|Chưa đăng nhập
请在窗口中登录|Sign in in the window|Hãy đăng nhập trong cửa sổ
取消|Cancel|Hủy
确认新 IP|Accept new IP|Xác nhận IP mới
登录|Sign in|Đăng nhập
检测|Check|Kiểm tra
查询额度|Check quota|Xem hạn mức
编辑|Edit|Sửa
停用|Disable|Tắt
启用|Enable|Bật
删除|Delete|Xóa
没有匹配的账号|No matching account|Không có tài khoản phù hợp
还没有 Muse 账号|No Muse accounts yet|Chưa có tài khoản Muse
编辑账号|Edit account|Sửa tài khoản
新增|New|Mới
账号名称|Account name|Tên tài khoản
例如 muse-01|e.g. muse-01|ví dụ muse-01
美国代理（HTTP / SOCKS5）|US proxy (HTTP / SOCKS5)|Proxy Mỹ (HTTP / SOCKS5)
留空不修改|Leave empty to keep|Để trống nếu không đổi
socks5://地址:端口:用户名:密码|socks5://host:port:user:password|socks5://host:port:user:password
Cookie JSON（可选，登录窗口被拒绝时用）|Cookie JSON (optional, if the sign-in window is refused)|Cookie JSON (tùy chọn, khi cửa sổ đăng nhập bị từ chối)
Cookie-Editor 导出的 JSON，只保留 muse.ai 的 Cookie|JSON exported by Cookie-Editor; only muse.ai cookies are kept|JSON xuất từ Cookie-Editor, chỉ giữ cookie muse.ai
请用静态 IP。代理密码和登录信息只加密保存在本机。|Use a static IP. Proxy passwords and logins are stored encrypted on this computer only.|Hãy dùng IP tĩnh. Mật khẩu proxy và đăng nhập chỉ lưu mã hóa trên máy này.
更换代理会先停用账号。|Changing the proxy disables the account first.|Đổi proxy sẽ tắt tài khoản trước.
保存后自动检测出口，再点「登录」。|The exit is checked after saving; then click "Sign in".|Lưu xong sẽ tự kiểm tra IP, sau đó bấm "Đăng nhập".
清空|Clear|Xóa hết
保存|Save|Lưu
保存并检测|Save and check|Lưu và kiểm tra
删除「{0}」？|Delete "{0}"?|Xóa "{0}"?
会删除本机保存的代理和登录信息，不影响 Muse 账号本身。|Removes the proxy and login saved here; the Muse account itself is not affected.|Xóa proxy và đăng nhập lưu trên máy, không ảnh hưởng tài khoản Muse.
任务详情|Task details|Chi tiết tác vụ
概览|Overview|Tổng quan
发送内容|Sent text|Nội dung gửi
运行日志|Log|Nhật ký
复制|Copy|Sao chép
这条任务没有日志（旧版本创建的）|No log (created by an older version)|Không có nhật ký (tạo từ bản cũ)
状态|Status|Trạng thái
账号|Account|Tài khoản
商品|Product|Sản phẩm
请求|Requested|Yêu cầu
{0} 秒 {1}|{0} s {1}|{0} giây {1}
创建时间|Created|Tạo lúc
更新时间|Updated|Cập nhật
开始处理|Started|Bắt đầu
提示词发出|Prompt sent|Đã gửi prompt
拿到对话|Conversation found|Có hội thoại
出现视频|Video appeared|Có video
未发出重试|Unsent retries|Thử lại khi chưa gửi
{0} 次|{0}×|{0} lần
额度换号|Quota switches|Đổi tài khoản do hạn mức
原片|Original|Bản gốc
字幕版|Subtitled|Bản có phụ đề
导出|Export|Xuất
参考图|Reference|Ảnh mẫu
换图|Swap|Thay ảnh
还没有结果|No result yet|Chưa có kết quả
{0}（{1} 次，提示词 V{2}）|{0} ({1}×, prompt V{2})|{0} ({1} lần, prompt V{2})
未使用|Not used|Không dùng
错误|Error|Lỗi
确认换图 ·|Review swap ·|Duyệt ảnh thay ·
检查商品的颜色、形状、数量和细节。通过后才会发给 Muse 生成视频。|Check colour, shape, count and details. Only approved pictures are sent to Muse.|Kiểm tra màu, hình dáng, số lượng và chi tiết. Duyệt xong mới gửi cho Muse.
：拖动框选要替换的商品|: drag to mark the product to replace|: kéo để khoanh sản phẩm cần thay
换图结果|Swapped picture|Ảnh đã thay
 · 第 {0} 次| · attempt {0}| · lần {0}
还没有换图结果|No swapped picture yet|Chưa có ảnh thay
取消框选|Cancel region|Bỏ khoanh
框选区域|Mark region|Khoanh vùng
会调用图片模型并产生费用|Calls the image model and costs money|Sẽ gọi mô hình ảnh và tốn phí
确定换图|Confirm swap|Xác nhận thay ảnh
按框选重新换图|Swap again with region|Thay lại theo vùng khoanh
重新换图|Swap again|Thay lại
通过，生成视频|Approve and generate|Duyệt, tạo video
从衍生图选图|From derived pictures|Từ ảnh phái sinh
选中的衍生图会标记为已使用|Picked pictures are marked as used|Ảnh đã chọn sẽ được đánh dấu đã dùng
已使用|Used|Đã dùng
正在读取…|Loading…|Đang tải…
没有衍生图|No derived pictures|Không có ảnh phái sinh
已选|Selected|Đã chọn
添加|Add|Thêm
提示词版本|Prompt versions|Phiên bản prompt
使用同款参考时，视频提示词由参考视频生成|With a reference clip the video prompt comes from the clip|Khi dùng video mẫu, prompt lấy từ video mẫu
写清镜头和必须保持的商品细节|Describe the shot and the product details to keep|Ghi rõ cảnh quay và chi tiết sản phẩm cần giữ
换图时使用「启用」的版本|Swaps use the active version|Thay ảnh dùng phiên bản đang bật
视频|Video|Video
版本|Version|Phiên bản
 · 当前启用| · active| · đang bật
版本名称|Version name|Tên phiên bản
视频提示词|Video prompt|Prompt video
商品替换提示词|Product swap prompt|Prompt thay sản phẩm
修改后要「更新版本」才会用于换图|Click "Update version" for swaps to use your changes|Bấm "Cập nhật" thì thay ảnh mới dùng bản sửa
回滚到此|Roll back to this|Quay lại bản này
存为新版本|Save as new|Lưu bản mới
启用版本|Activate|Bật bản này
更新版本|Update version|Cập nhật
已更新|Updated|Đã cập nhật
已存为新版本|Saved as a new version|Đã lưu bản mới
已回滚到这个版本|Rolled back|Đã quay lại bản này
文件名|File|Tên tệp
画面|Frame|Khung hình
时长|Duration|Thời lượng
秒（请求|s (requested|giây (yêu cầu
秒）|s)|giây)
原片大小|Original size|Dung lượng gốc
已导出|Exported|Đã xuất
重做字幕|Redo subtitles|Làm lại phụ đề
添加字幕|Add subtitles|Thêm phụ đề
撤销字幕|Remove subtitles|Bỏ phụ đề
打开位置|Show in folder|Mở thư mục
Muse创意室|Muse Creative|Muse Creative
用参考图批量生成短视频，每个 Muse 账号走自己的美国代理。|Make short videos from reference pictures in bulk; each Muse account uses its own US proxy.|Tạo hàng loạt video ngắn từ ảnh mẫu, mỗi tài khoản Muse dùng proxy Mỹ riêng.
换图设置|Swap settings|Cài đặt thay ảnh
继续队列|Resume queue|Chạy tiếp
不再发送新的，已在运行的会跑完|Sends nothing new; running tasks finish|Không gửi thêm, tác vụ đang chạy vẫn xong
暂停队列|Pause queue|Tạm dừng
刷新|Refresh|Làm mới
从参考图创建|Create from references|Tạo từ ảnh mẫu
任务与成片|Tasks and videos|Tác vụ và video
参考图片|Reference pictures|Ảnh mẫu
支持 JPG、PNG、WEBP，可多选，最多|JPG, PNG, WEBP; up to|JPG, PNG, WEBP; tối đa
张，每张生成 1 条视频|pictures, one video each|ảnh, mỗi ảnh 1 video
上传参考图|Upload pictures|Tải ảnh mẫu
从素材库选图|From library|Từ thư viện
移除|Remove|Gỡ
支持 JPG、PNG、WEBP，可多选 · 也可以从素材库选择|JPG, PNG, WEBP, several at once · or pick from the library|JPG, PNG, WEBP, chọn nhiều · hoặc chọn từ thư viện
张参考图|reference pictures|ảnh mẫu
生成设置|Generation settings|Cài đặt tạo
批量创建 Muse 图生视频任务|Create Muse image-to-video tasks in bulk|Tạo hàng loạt tác vụ ảnh thành video
生成模式|Mode|Chế độ
参考图生视频|Reference to video|Ảnh mẫu thành video
首尾帧|First/last frame|Khung đầu/cuối
推近比例|Zoom|Mức phóng
自动把首帧放大作为尾帧，一起发给 Muse；Muse 不一定严格遵守|The zoomed opening frame is sent as the closing frame; Muse may not follow it strictly|Khung đầu phóng to làm khung cuối, gửi cùng cho Muse; Muse có thể không theo sát
视频时长|Duration|Thời lượng
秒|s|giây
画面比例|Aspect ratio|Tỉ lệ khung
时长和比例写在提示词里，以 Muse 实际输出为准|Duration and ratio are part of the prompt; Muse decides the actual output|Thời lượng và tỉ lệ nằm trong prompt, kết quả do Muse quyết định
已选 {0} 个商品|{0} products selected|Đã chọn {0} sản phẩm
选择商品（可多选）|Choose products|Chọn sản phẩm (nhiều)
选择要换上的商品|Choose the product to swap in|Chọn sản phẩm cần thay vào
选择商品（可选）|Choose a product (optional)|Chọn sản phẩm (tùy chọn)
每个商品生成 1 条同款视频，参考画面里的商品会换成它|One video per product; the product in the clip is replaced with it|Mỗi sản phẩm 1 video, sản phẩm trong mẫu được thay bằng nó
参考图里的商品会换成它|The product in the picture is replaced with it|Sản phẩm trong ảnh mẫu được thay bằng nó
只用于归类成片|Only used to file the videos|Chỉ dùng để phân loại video
清除|Clear|Xóa
商品换图|Product swap|Thay sản phẩm
不换图|No swap|Không thay
换成所选商品|Swap in the product|Thay bằng sản phẩm đã chọn
参考图里已经是你的商品就不用换图；换图会调用图片模型并产生费用|Not needed if the picture already shows your product; swapping calls the image model and costs money|Ảnh đã là sản phẩm của bạn thì không cần; thay ảnh sẽ gọi mô hình ảnh và tốn phí
换图确认|Swap review|Duyệt ảnh thay
我确认后再生成|Generate after my review|Tạo sau khi tôi duyệt
直接生成|Generate directly|Tạo luôn
建议先确认，避免商品不准时浪费 Muse 额度|Reviewing first avoids wasting Muse quota on a wrong product|Nên duyệt trước để không phí hạn mức Muse
自动分配|Automatic|Tự động
同款参考视频|Reference clip|Video mẫu
提示词|Prompt|Prompt
可用账号|Available accounts|Tài khoản dùng được
每条只发送一次，加入前会再确认|Each is sent once; you confirm before adding|Mỗi video chỉ gửi một lần, sẽ hỏi lại trước khi thêm
创建任务 (|Create tasks (|Tạo tác vụ (
账号调度|Account scheduling|Điều phối tài khoản
按可用账号自动分配|Assigned to available accounts|Tự chia cho tài khoản dùng được
处理中|Processing|Đang xử lý
待人工确认|Needs review|Chờ xác nhận
同时运行|Run at once|Chạy cùng lúc
条|tasks|tác vụ
执行规则|Rules|Quy tắc
全选|Select all|Chọn hết
任务筛选|Task filter|Lọc tác vụ
取消排队|Cancel queued|Hủy hàng đợi
网格|Grid|Lưới
列表|List|Danh sách
通过换图 (|Approve swaps (|Duyệt ảnh thay (
撤销字幕 (|Remove subtitles (|Bỏ phụ đề (
批量添加字幕 (|Add subtitles (|Thêm phụ đề (
批量删除 (|Delete (|Xóa (
去发布 (|Publish (|Đăng (
导出 (|Export (|Xuất (
还没有任务|No tasks yet|Chưa có tác vụ
上传参考图并创建任务后，进度和成片会显示在这里。|Upload pictures and create tasks; progress and videos appear here.|Tải ảnh và tạo tác vụ, tiến độ và video sẽ hiện ở đây.
选择|Select|Chọn
播放|Play|Phát
已发布|Published|Đã đăng
已换入复刻|Swapped into clone|Đã thay vào bản nhân bản
复刻未自动替换|Not swapped into clone|Chưa tự thay vào bản nhân bản
来自复刻|From clone|Từ bản nhân bản
发出后：|After sending:|Sau khi gửi:
确认换图|Review swap|Duyệt ảnh thay
处理换图|Fix swap|Xử lý ảnh thay
找回|Collect|Lấy lại
没有结果|No result|Không có kết quả
停止|Stop|Dừng
字幕|Subtitles|Phụ đề
重试|Retry|Thử lại
详情与日志|Details and log|Chi tiết và nhật ký
上一页|Previous page|Trang trước
下一页|Next page|Trang sau
对之后新建的任务生效|Applies to new tasks|Áp dụng cho tác vụ mới
换图失败自动重试次数（0–5）|Automatic retries after a failed swap (0–5)|Số lần tự thử lại khi thay ảnh lỗi (0–5)
每次重试都可能产生图片费用，默认不自动重试。|Every retry may cost money; off by default.|Mỗi lần thử lại có thể tốn phí, mặc định không tự thử.
自动识别参考图里的商品位置（会调用 AI 分析）|Find the product in the picture automatically (uses AI)|Tự tìm vị trí sản phẩm trong ảnh (dùng AI)
关闭后按画面中央区域替换，可在确认时手动框选。|When off, the centre is replaced; you can mark a region during review.|Khi tắt sẽ thay vùng giữa ảnh, có thể khoanh tay khi duyệt.
进行中|Active|Đang chạy
待确认换图|Swap to review|Chờ duyệt ảnh
待挑图|Pick an image|Chờ chọn ảnh
挑图|Pick image|Chọn ảnh
完成|Done|Xong
未加字幕|No subtitles|Chưa phụ đề
未导出|Not exported|Chưa xuất
失败/取消|Failed/cancelled|Lỗi/đã hủy
换图后先由你确认，通过才发给 Muse|You review swaps before they go to Muse|Bạn duyệt ảnh thay rồi mới gửi cho Muse
每个账号同时只跑 1 条，走自己的代理|One task per account at a time, through its own proxy|Mỗi tài khoản chạy 1 tác vụ, qua proxy riêng
提示词只发送一次，结果不明转人工确认，不自动重发|Prompts are sent once; unclear results wait for you and are never resent|Prompt chỉ gửi một lần; kết quả không rõ sẽ chờ bạn, không tự gửi lại
额度不足时换下一个账号；代理断开时等待恢复|Out of quota: next account. Proxy down: waits|Hết hạn mức thì đổi tài khoản; proxy lỗi thì chờ
重启后自动找回已发送的，未发送的要手动继续|After a restart sent tasks are collected; unsent ones wait for you|Khởi động lại sẽ tự lấy lại tác vụ đã gửi, tác vụ chưa gửi phải bấm chạy tiếp
队列已暂停，点「继续队列」后才会发送。|The queue is paused. Click "Resume queue" to send.|Hàng đợi đang dừng. Bấm "Chạy tiếp" để gửi.
没有可用账号，任务在等待。|No account available; tasks are waiting.|Không có tài khoản dùng được, tác vụ đang chờ.
可用账号额度都不足，任务在等待；在账号管理里点「检测」可立即重试。|All available accounts are out of quota; click "Check" under Accounts to retry now.|Mọi tài khoản đều hết hạn mức; bấm "Kiểm tra" trong Quản lý tài khoản để thử ngay.
{0} 秒|{0} s|{0} giây
选择参考图|Choose reference pictures|Chọn ảnh mẫu
图片|Pictures|Ảnh
通过 {0} 张换图|Approve {0} swaps|Duyệt {0} ảnh thay
队列已暂停，要点「继续队列」才开始。|The queue is paused; click "Resume queue" to start.|Hàng đợi đang dừng, bấm "Chạy tiếp" để bắt đầu.
通过后会发给 Muse 生成 {0} 条视频，消耗 Muse 额度。{1}|{0} videos will be sent to Muse and use Muse quota. {1}|Sẽ gửi Muse tạo {0} video, tốn hạn mức Muse. {1}
确定生成|Generate|Xác nhận tạo
每个商品生成 1 条同款，共 {0} 条。|One video per product, {0} in total. |Mỗi sản phẩm 1 video, tổng {0}.
每张参考图生成 1 条，共 {0} 条。|One video per picture, {0} in total. |Mỗi ảnh 1 video, tổng {0}.
你确认换图后才发给 Muse。|They go to Muse only after your review.|Bạn duyệt rồi mới gửi cho Muse.
换图后直接发给 Muse，消耗 {0} 次额度。|They then go straight to Muse, using quota {0} times.|Sau đó gửi thẳng cho Muse, tốn {0} lượt hạn mức.
会先换图 {0} 次，产生图片模型费用；{1}|{0} swaps first, with image model cost. {1}|Thay ảnh {0} lần trước, tốn phí mô hình ảnh. {1}
会发送 {0} 次并消耗 Muse 额度。|Sends {0} times and uses Muse quota.|Sẽ gửi {0} lần và tốn hạn mức Muse.
加入 {0} 条任务|Add {0} tasks|Thêm {0} tác vụ
队列已暂停，加入后要点「继续队列」才开始。|The queue is paused; click "Resume queue" after adding.|Hàng đợi đang dừng, thêm xong bấm "Chạy tiếp".
确定加入 {0} 条|Add {0}|Thêm {0}
会处理等待中的 {0} 条，消耗 Muse 额度；需要换图的会先产生图片费用。|Processes {0} waiting tasks and uses Muse quota; swaps cost image money first.|Sẽ xử lý {0} tác vụ đang chờ, tốn hạn mức Muse; tác vụ thay ảnh tốn phí ảnh trước.
继续|Resume|Tiếp tục
重试任务|Retry task|Thử lại tác vụ
会重新换图，产生图片模型费用。|Swaps again, with image model cost.|Sẽ thay ảnh lại, tốn phí mô hình ảnh.
会重新发送 1 次，消耗 Muse 额度。|Sends once more and uses Muse quota.|Sẽ gửi lại 1 lần, tốn hạn mức Muse.
确定重试|Retry|Xác nhận thử lại
确认没有结果|No result|Xác nhận không có kết quả
请先到 Muse 网页确认没有结果。标记后任务变成失败，可以重试。|Check on muse.ai first. The task is then marked failed and can be retried.|Hãy kiểm tra trên muse.ai trước. Tác vụ sẽ thành lỗi và có thể thử lại.
{0} 条任务|{0} tasks|{0} tác vụ
删除任务|Delete task|Xóa tác vụ
，包括 {0} 个视频文件和字幕版|, including {0} videos and subtitled versions|, gồm {0} video và bản phụ đề
删除{0}{1}，不能恢复。已导出的文件会保留。|Delete {0}{1}? This cannot be undone. Exported files are kept.|Xóa {0}{1}? Không thể khôi phục. Tệp đã xuất được giữ lại.
，{0} 条失败|, {0} failed|, {0} lỗi
已给 {0} 条视频添加字幕{1}|Subtitles added to {0} videos{1}|Đã thêm phụ đề cho {0} video{1}
已撤销 {0} 条字幕|Subtitles removed from {0} videos|Đã bỏ phụ đề {0} video
选择导出文件夹|Choose export folder|Chọn thư mục xuất
已导出 {0} 条视频|{0} videos exported|Đã xuất {0} video
待检测|Not checked|Chưa kiểm tra
待登录|Sign in needed|Cần đăng nhập
登录失效|Login expired|Hết phiên
代理异常|Proxy problem|Lỗi proxy
出口不可用|Exit not usable|IP ra không dùng được
出口 IP 变化|Exit IP changed|IP ra đã đổi
换图中|Swapping|Đang thay ảnh
排队中|Queued|Đang chờ
失败|Failed|Lỗi
已取消|Cancelled|Đã hủy
准备中|Preparing|Đang chuẩn bị
发送提示词|Sending prompt|Đang gửi prompt
等待生成|Generating|Đang tạo
找回中|Collecting|Đang lấy lại
下载视频|Downloading|Đang tải
等待换图|Waiting to swap|Chờ thay ảnh
换图失败|Swap failed|Thay ảnh lỗi
等待找回|Waiting to collect|Chờ lấy lại
本机安全存储不可用，无法保存代理和登录信息|Secure storage is unavailable; the proxy and login cannot be saved|Không có kho bảo mật, không lưu được proxy và đăng nhập
无法在本机解密账号信息，请重新填写|The account cannot be decrypted here; enter it again|Không giải mã được tài khoản, hãy nhập lại
Muse 账号不存在|The Muse account does not exist|Tài khoản Muse không tồn tại
该账号还没有设置代理，已停止访问|The account has no proxy; access stopped|Tài khoản chưa có proxy, đã dừng truy cập
Muse 账号 {0}|Muse account {0}|Tài khoản Muse {0}
账号未就绪，请先完成代理检测和登录|The account is not ready; check the proxy and sign in first|Tài khoản chưa sẵn sàng, hãy kiểm tra proxy và đăng nhập
请先检测代理并确认美国出口|Check the proxy and confirm a US exit first|Hãy kiểm tra proxy và xác nhận IP Mỹ
请先登录 Muse|Sign in to Muse first|Hãy đăng nhập Muse
当前出口不在美国，不能确认|The exit is not in the US and cannot be accepted|IP ra không ở Mỹ, không thể xác nhận
代理用户名或密码错误|Wrong proxy user name or password|Sai tên hoặc mật khẩu proxy
代理连接超时，未使用本机网络|The proxy timed out; your own network was not used|Proxy quá hạn, không dùng mạng của máy
代理连接失败，未使用本机网络|The proxy connection failed; your own network was not used|Không kết nối được proxy, không dùng mạng của máy
没有找到 Chrome 或 Edge，请先安装|Chrome or Edge was not found; install one first|Không tìm thấy Chrome hoặc Edge, hãy cài đặt
登录已失效，请重新登录|The login expired; sign in again|Phiên đã hết, hãy đăng nhập lại
Muse 拒绝访问（403），可能是出口地区、IP 或账号权限|Muse refused access (403): exit region, IP or account permission|Muse từ chối (403): do khu vực, IP hoặc quyền tài khoản
Muse 会话检查失败（{0}）|The Muse session check failed ({0})|Kiểm tra phiên Muse lỗi ({0})
Muse 返回了无法识别的会话信息|Muse returned an unknown session answer|Muse trả về thông tin phiên không rõ
未知|unknown|không rõ
Muse 工作区未就绪（{0}）|The Muse workspace is not ready ({0})|Không gian Muse chưa sẵn sàng ({0})
该账号的登录窗口已经打开|The sign-in window is already open|Cửa sổ đăng nhập đã mở
登录窗口已关闭，没有完成登录|The sign-in window was closed before signing in|Cửa sổ đã đóng, chưa đăng nhập xong
等待登录超时|Sign-in timed out|Hết thời gian chờ đăng nhập
已停止等待；Muse 端可能仍在生成，可稍后找回|Stopped waiting; Muse may still be generating, collect it later|Đã dừng chờ; Muse có thể vẫn đang tạo, hãy lấy lại sau
已取消，提示词没有发出|Cancelled; the prompt was not sent|Đã hủy, prompt chưa gửi
没有保存对话地址，请到 Muse 网页查看结果|No conversation was saved; look on muse.ai|Chưa lưu hội thoại, hãy xem trên muse.ai
Muse 要求重新登录|Muse asks to sign in again|Muse yêu cầu đăng nhập lại
Muse 一直在连接，没有就绪|Muse kept connecting and never got ready|Muse kết nối mãi, chưa sẵn sàng
Muse 页面没有出现输入框|The Muse page showed no input box|Trang Muse không có ô nhập
输入框里有残留附件，已停止|The input box had leftover attachments; stopped|Ô nhập còn tệp cũ, đã dừng
找不到 Muse 的上传控件|The Muse upload control was not found|Không tìm thấy nút tải lên của Muse
参考图没有上传成功|The reference picture was not uploaded|Tải ảnh mẫu không thành công
找不到 Muse 输入框|The Muse input box was not found|Không tìm thấy ô nhập của Muse
发送按钮一直不可用|The send button never became available|Nút gửi luôn bị khóa
提示词没有完整填入|The prompt was not entered completely|Prompt chưa nhập đủ
提示词仍在输入框里，没有发出|The prompt is still in the input box; not sent|Prompt vẫn trong ô nhập, chưa gửi
无法确认提示词是否发出，请到 Muse 网页查看|Not clear whether the prompt was sent; look on muse.ai|Không rõ prompt đã gửi chưa, hãy xem trên muse.ai
Muse 页面跳到了其他对话，已停止|Muse switched to another conversation; stopped|Muse chuyển sang hội thoại khác, đã dừng
视频下载失败|The video download failed|Tải video lỗi
已生成，但没能取回视频：{0}|Generated, but the video could not be fetched: {0}|Đã tạo nhưng không tải được video: {0}
账号额度不足|The account is out of quota|Tài khoản hết hạn mức
账号额度不足：{0}|The account is out of quota: {0}|Tài khoản hết hạn mức: {0}
Muse 服务繁忙|Muse is busy|Muse đang bận
Muse 服务繁忙：{0}|Muse is busy: {0}|Muse đang bận: {0}
Muse 没有生成|Muse did not generate|Muse không tạo
Muse 没有生成：{0}|Muse did not generate: {0}|Muse không tạo: {0}
Muse 只回复了文字，没有出现视频：{0}|Muse answered with text only: {0}|Muse chỉ trả lời chữ, không có video: {0}
Muse 一直显示没有送达，请到 Muse 网页确认|Muse keeps showing the message as not delivered; check on the Muse website|Muse vẫn báo chưa gửi được, hãy kiểm tra trên trang Muse
Muse 没有建立对话，页面一直没有反应，请到 Muse 网页确认|Muse did not open a conversation and the page does not respond; check on the Muse website|Muse không tạo hội thoại và trang không phản hồi, hãy kiểm tra trên trang Muse
等待生成超时，可稍后找回|Waiting timed out; collect it later|Hết thời gian chờ, hãy lấy lại sau
代理连接中断，未使用本机网络|The proxy connection broke; your own network was not used|Proxy bị ngắt, không dùng mạng của máy
Muse 窗口被关闭|The Muse window was closed|Cửa sổ Muse đã bị đóng
Muse 页面操作失败|An action on the Muse page failed|Thao tác trên trang Muse lỗi
下载的文件不是有效视频|The downloaded file is not a valid video|Tệp tải về không phải video hợp lệ
没能自动找到要替换的商品位置，请手动框选区域|The product was not found automatically; mark the region yourself|Không tự tìm được sản phẩm, hãy khoanh vùng
这个商品还没有可用的参考图，请先在商品库生成或指定|The product has no usable reference picture; make or choose one in the product library|Sản phẩm chưa có ảnh tham chiếu, hãy tạo hoặc chọn trong kho sản phẩm
商品不存在|The product does not exist|Sản phẩm không tồn tại
提交换图|Swap submitted|Đã gửi thay ảnh
换图一直没有结果|The swap never finished|Thay ảnh mãi không có kết quả
换图文件不存在|The swapped picture is missing|Không có tệp ảnh thay
换图完成，等待确认|Swap done, waiting for review|Thay xong, chờ duyệt
换图完成|Swap done|Thay ảnh xong
换图失败：{0}|Swap failed: {0}|Thay ảnh lỗi: {0}
换图已确认|Swap approved|Đã duyệt ảnh thay
没有可以确认的换图|No swap to approve|Không có ảnh thay để duyệt
只有待确认的换图可以重做|Only swaps waiting for review can be redone|Chỉ ảnh chờ duyệt mới làm lại được
框选区域无效|The region is not valid|Vùng khoanh không hợp lệ
按框选区域重新换图|Swapping again with the marked region|Thay lại theo vùng khoanh
开始准备|Preparing|Bắt đầu chuẩn bị
点击发送|Send clicked|Đã bấm gửi
提示词已发出，等待生成|Prompt sent, generating|Đã gửi prompt, đang tạo
打开原对话找结果|Opening the conversation for the result|Mở hội thoại để tìm kết quả
发现视频，开始下载|Video found, downloading|Có video, đang tải
任务不存在|The task does not exist|Tác vụ không tồn tại
应用重启|The app restarted|Ứng dụng khởi động lại
应用退出时正在提交换图，不确定是否已扣费，可重新换图|The app closed while submitting a swap; it may or may not have been charged. You can swap again|Ứng dụng đóng khi đang gửi thay ảnh, không rõ đã trừ phí chưa; có thể thay lại
应用在等待结果时退出，且没有拿到对话地址，请到 Muse 网页查看|The app closed while waiting and has no conversation address; look on muse.ai|Ứng dụng đóng khi đang chờ và chưa có hội thoại, hãy xem trên muse.ai
开始找回|Collecting|Bắt đầu lấy lại
{0}，账号 {1}|{0}, account {1}|{0}, tài khoản {1}
已保存对话地址|Conversation saved|Đã lưu hội thoại
视频已下载|Video downloaded|Đã tải video
任务失败|The task failed|Tác vụ lỗi
已停止找回|Collecting stopped|Đã dừng lấy lại
请填写提示词|Enter a prompt|Hãy nhập prompt
提示词过长|The prompt is too long|Prompt quá dài
请选择参考图|Choose reference pictures|Hãy chọn ảnh mẫu
一次最多 {0} 条|{0} at most at once|Tối đa {0} mỗi lần
参考图只支持 JPG、PNG、WebP|Reference pictures must be JPG, PNG or WebP|Ảnh mẫu chỉ hỗ trợ JPG, PNG, WebP
有参考图不存在|A reference picture is missing|Có ảnh mẫu không tồn tại
单张参考图不能超过 40 MB|A reference picture may not exceed 40 MB|Mỗi ảnh mẫu tối đa 40 MB
任务已创建|Task created|Đã tạo tác vụ
只有失败或已取消的任务可以重试|Only failed or cancelled tasks can be retried|Chỉ thử lại được tác vụ lỗi hoặc đã hủy
手动重试|Retried by hand|Thử lại thủ công
该任务不需要找回|This task needs no collecting|Tác vụ này không cần lấy lại
没有保存对话地址，请到 Muse 网页查看|No conversation was saved; look on muse.ai|Chưa lưu hội thoại, hãy xem trên muse.ai
手动找回|Collected by hand|Lấy lại thủ công
该任务不需要确认|This task needs no review|Tác vụ này không cần xác nhận
已人工确认没有结果|Confirmed by hand: no result|Đã xác nhận không có kết quả
请先停止任务|Stop the task first|Hãy dừng tác vụ trước
代理地址或端口不正确|The proxy address or port is wrong|Sai địa chỉ hoặc cổng proxy
代理用户名或密码过长|The proxy user name or password is too long|Tên hoặc mật khẩu proxy quá dài
请填写代理地址|Enter the proxy address|Hãy nhập địa chỉ proxy
只支持 HTTP 和 SOCKS5 代理|Only HTTP and SOCKS5 proxies are supported|Chỉ hỗ trợ proxy HTTP và SOCKS5
代理地址格式不正确|The proxy address is not valid|Địa chỉ proxy không đúng
代理地址格式不正确；密码含特殊字符时请做 URL 编码|The proxy address is not valid; URL-encode special characters in the password|Địa chỉ proxy không đúng; hãy mã hóa URL ký tự đặc biệt trong mật khẩu
代理用户名或密码的 URL 编码不正确|The URL encoding of the proxy user name or password is wrong|Mã hóa URL của tên hoặc mật khẩu proxy không đúng
Muse 页面打不开|The Muse page did not open|Không mở được trang Muse
Muse 页面没有就绪|The Muse page did not get ready|Trang Muse chưa sẵn sàng
找不到 Muse 的设置入口|The Muse settings button was not found|Không tìm thấy nút cài đặt Muse
找不到 Muse 设置菜单里的设置项|The settings entry in the Muse menu was not found|Không tìm thấy mục cài đặt trong menu Muse
额度面板里没有读到用量|No usage was found in the quota panel|Không đọc được mức dùng
读取额度失败|The quota could not be read|Đọc hạn mức lỗi
有视频正在处理中，请稍候|A video is still being processed; please wait|Có video đang xử lý, hãy chờ
请填写字幕标题|Enter a subtitle title|Hãy nhập tiêu đề phụ đề
请选择已完成的视频|Choose finished videos|Hãy chọn video đã xong
字幕生成失败|Subtitles failed|Tạo phụ đề lỗi
字幕生成失败：{0}|Subtitles failed: {0}|Tạo phụ đề lỗi: {0}
已添加字幕|Subtitles added|Đã thêm phụ đề
字幕生成失败，请检查字幕配置|Subtitles failed; check the subtitle settings|Tạo phụ đề lỗi, hãy kiểm tra cài đặt
已撤销字幕|Subtitles removed|Đã bỏ phụ đề
请选择导出文件夹|Choose an export folder|Hãy chọn thư mục xuất
已导出 {0}|Exported {0}|Đã xuất {0}
该账号正在使用中，请稍候|The account is in use; please wait|Tài khoản đang được dùng, hãy chờ
代理出口在 {0}，不是美国，已停止访问|The proxy exit is in {0}, not the US; access stopped|Proxy ra ở {0}, không phải Mỹ, đã dừng truy cập
出口 IP 由 {0} 变为 {1}，请确认后再用|The exit IP changed from {0} to {1}; accept it before use|IP ra đổi từ {0} sang {1}, hãy xác nhận trước khi dùng
该出口打不开 muse.ai{0}|muse.ai does not open through this exit{0}|IP này không mở được muse.ai{0}
账号未启用|The account is disabled|Tài khoản chưa bật
账号未就绪|The account is not ready|Tài khoản chưa sẵn sàng
同款模板不存在，请重新上传参考视频|The reference clip is gone; upload it again|Video mẫu không còn, hãy tải lại
请至少选择一个商品|Choose at least one product|Hãy chọn ít nhất một sản phẩm
换图需要先选择商品|Choose a product before swapping|Hãy chọn sản phẩm trước khi thay ảnh
账号未就绪，请先登录|The account is not ready; sign in first|Tài khoản chưa sẵn sàng, hãy đăng nhập
Cookie JSON 格式不正确|The cookie JSON is not valid|Cookie JSON không đúng
该账号正在使用中，请先取消|The account is in use; cancel first|Tài khoản đang được dùng, hãy hủy trước
没有找到 Muse 登录会话，请确认已登录 muse.ai|No Muse login was found; make sure you are signed in to muse.ai|Không thấy phiên Muse, hãy chắc chắn đã đăng nhập muse.ai
字幕生成失败，请检查视频编码和字幕配置|Subtitles failed; check the video encoding and subtitle settings|Tạo phụ đề lỗi, hãy kiểm tra mã hóa video và cài đặt
`

export const MUSE_TEXTS: Record<string, { 'en-US': string; 'vi-VN': string }> = Object.fromEntries(
  ROWS.split('\n').filter((row) => row.includes('|')).map((row) => {
    const [zh, en, vi] = row.split('|')
    return [zh, { 'en-US': en, 'vi-VN': vi }]
  }),
)

// Longest first, so a specific message wins over a general one.
const PATTERNS = Object.keys(MUSE_TEXTS)
  .filter((key) => /\{\d\}/.test(key) && /[一-鿿]{2}/.test(key))
  .sort((a, b) => b.length - a.length)
  .map((key) => ({ key, test: new RegExp(`^${key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '([\\s\\S]*)')}$`) }))

/** Translates a Chinese text; unknown texts (product names, Muse replies) are returned unchanged. */
export function translateMuse(text: string, locale: string, args: unknown[] = []): string {
  const fill = (template: string, values: unknown[]) => template.replace(/\{(\d)\}/g, (whole, index) => (Number(index) in values ? String(values[Number(index)] ?? '') : whole))
  const lang = locale === 'en-US' || locale === 'vi-VN' ? locale : null
  if (!lang) return fill(text, args)
  const exact = MUSE_TEXTS[text]
  if (exact) return fill(exact[lang], args)
  if (args.length || !/[一-鿿]/.test(text)) return fill(text, args)
  for (const { key, test } of PATTERNS) {
    const match = test.exec(text)
    if (match) return fill(MUSE_TEXTS[key][lang], match.slice(1).map((value) => translateMuse(value, locale)))
  }
  return text
}
