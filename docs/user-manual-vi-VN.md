# Hướng dẫn sử dụng VideoGenerate (Tiếng Việt)

**Phiên bản tài liệu**: Tham chiếu phiên bản ứng dụng trong `package.json`. Nội dung hiển thị trong phần mềm luôn được ưu tiên.

---

## 1. Giới thiệu

**VideoGenerate** là ứng dụng desktop trên **Windows** để **tạo hàng loạt video dọc ngắn**. Bạn quản lý từng đoạn clip trong **Sản phẩm**, cấu hình cấu trúc và hiệu ứng trong **Mẫu**, rồi tạo nhiều file **`.mp4`** trong **Tác vụ**, có chống trùng lặp và hàng đợi render.

---

## 2. Môi trường chạy

| Hạng mục | Ghi chú |
|----------|---------|
| Hệ điều hành | **Windows 10/11, 64-bit (x64)** |
| Mạng | Kích hoạt và kiểm tra license thầm lặng cần truy cập máy chủ license; Edge-TTS (lồng tiếng) cần mạng khi bật |
| Ổ đĩa | Dành đủ dung lượng cho thư mục xuất và bộ nhớ đệm; tạo hàng loạt dùng nhiều dung lượng tạm và file thành phẩm |

---

## 3. Cài đặt và gỡ

### 3.1 Cài đặt

1. Lấy file cài (thường là `VideoGenerate-x.x.x-Setup.exe`).
2. Chạy và làm theo trình hướng dẫn; chọn thư mục cài đặt.
3. Mở **VideoGenerate** từ màn hình nền hoặc menu Start.

### 3.2 Gỡ cài đặt

- Gỡ qua **Cài đặt Windows → Ứng dụng**.  
- **Lưu ý**: Gói phân phối có thể **xóa dữ liệu ứng dụng** khi gỡ (cấu hình và dữ liệu nghiệp vụ). Hãy sao lưu file quan trọng trước.

---

## 4. Khởi động lần đầu và bản quyền

### 4.1 Màn hình kích hoạt

Lần đầu hoặc khi license hết hạn / không hợp lệ, bạn sẽ thấy **Kích hoạt**:

- **Mã máy**: Tạo cục bộ, chỉ đọc; dùng **Sao chép** gửi nhà phân phối để gắn thiết bị hoặc hỗ trợ.
- **Mã bản quyền**: Nhập **đúng như đã nhận** (phân biệt hoa thường).
- Nhấn **Kích hoạt**. Thành công thì mã được lưu cục bộ và vào giao diện chính.

### 4.2 Lỗi thường gặp

| Hiện tượng | Nguyên nhân có thể |
|------------|---------------------|
| Mã không hợp lệ | Gõ sai hoặc mã chưa kích hoạt trên máy chủ |
| Đã gắn thiết bị khác | Mã đã khóa máy khác khi kích hoạt lần đầu; liên hệ nhà phân phối |
| Hết hạn | Quá thời hạn license |
| Lỗi xác minh / mạng | Kiểm tra tường lửa và kết nối tới API license |

### 4.3 Mỗi lần mở phần mềm

Ứng dụng **kiểm tra thầm lặng** mã đã lưu và mã máy. Nếu thất bại, bạn cần kích hoạt lại (gia hạn hoặc đổi mã theo chính sách nhà phân phối).

---

## 5. Giao diện và ngôn ngữ

- Thanh bên trái: **Sản phẩm**, **Mẫu**, **Tác vụ**.
- Góc dưới thanh bên: chọn **ngôn ngữ** — **简体中文 / English / Tiếng Việt** (có lưu lại).
- Thanh tiêu đề: thu nhỏ / phóng to / đóng cửa sổ (theo bản build).

---

## 6. Sản phẩm (thư viện media)

### 6.1 Sản phẩm và đoạn (segment)

- Tạo sản phẩm (ví dụ ốp điện thoại, bông tai) để nhóm tài liệu.
- Mỗi sản phẩm có nhiều **khung đoạn** (ví dụ hook, show, detail). Tên đoạn có thể tùy chỉnh; thêm đoạn mới khi cần.

### 6.2 Thêm và xem clip

- **Thêm video** vào từng đoạn. Phần mềm đọc thời lượng, độ phân giải, FPS, v.v. và tạo thumbnail.
- **Kéo thả**: khi đã chọn sản phẩm, kéo **file video hoặc cả thư mục** vào vùng đoạn/media bên phải; khi lớp phủ xanh hiện, thả chuột để **nhập hàng loạt vào đoạn đang chọn** (xử lý giống «Thêm nguyên liệu»; quét đệ quy thư mục cho các định dạng video thông dụng).
- **Cắt video dài**: chọn một file dài, đặt độ dài mỗi đoạn (mặc định ~3 giây); ứng dụng cắt nhanh (copy stream) và **thêm hàng loạt clip vào đoạn hiện tại** (lưu trong dữ liệu app—không xóa file đang được tham chiếu).
- **Phân trang** giúp danh sách lớn mượt; bấm thẻ để **xem trước** video gốc.
- Chế độ **chọn nhiều**: chọn cả trang, bỏ chọn, hoặc xóa hàng loạt.

### 6.3 Gợi ý

- Càng nhiều **clip khác nhau** mỗi đoạn, càng dễ tạo đủ số lượng video và vượt qua lọc trùng.

---

## 7. Mẫu (cấu trúc và hiệu ứng)

Chọn **sản phẩm** mà mẫu đi theo; các dòng đoạn đồng bộ với sản phẩm đó. Sản phẩm thêm đoạn mới thì mẫu bổ sung tham số mặc định.

### 7.1 Cấu trúc và thời lượng

- **Thêm / xóa / sắp xếp** đoạn (có kéo thả).
- Đặt **khoảng tổng thời lượng** video (thường ~7–15 giây, theo giao diện).
- **Bỏ qua đầu clip**: bỏ vài giây đầu để tránh màn đen / intro.

### 7.2 Thứ tự và ngẫu nhiên

- Có thể **xáo trộn** thứ tự đoạn (thường giữ cố định vài đoạn đầu) để giảm video trùng cảm quan.

### 7.3 Tiêu đề trên màn hình (không TTS)

- Bật **tiêu đề**: trong mẫu dùng **thẻ nhóm** — mỗi thẻ = **dòng tiêu đề + khối ký hiệu** (nhiều dòng được). Thêm nhiều thẻ để A/B; mỗi video **chọn ngẫu nhiên một nhóm** (vùng trên).  
- Có **mẫu ký hiệu** chèn nhanh; **Quản lý mẫu** để sửa thư viện lưu trên máy (khoảng 20 mặc định, khôi phục được).  
- Không dùng tổng hợp giọng nói cho mục này.

### 7.4 Lồng tiếng (Edge-TTS)

- Bật **lồng tiếng** để tạo âm thanh từ **kho văn bản lồng tiếng** (chọn ngẫu nhiên theo dòng), trộn vào video.  
- **Văn bản lồng tiếng** và **tiêu đề** là hai kho độc lập; chữ lớn phía trên điền ở khu vực tiêu đề.  
- Có thể dùng dòng `---` (ít nhất ba dấu `-`) để tách khối trong trình sửa; sau khi lưu vẫn tính **theo dòng** vào kho ngẫu nhiên.

### 7.5 Phụ đề ASS

- Điều khiển kiểu phụ đề cuộn kèm TTS khi bật. **Tiêu đề** có thể ghi độc lập với công tắc ASS—xem đúng nhãn trên màn hình.  
- Thông số lề giúp căn khoảng cách với mép trên/dưới.  
- Với preset **chữ trắng mềm**, tiêu đề/phụ đề ghi video dùng kiểu **đậm nghiêng** bo tròn; font đi kèm hỗ trợ fallback đa ngôn ngữ (lần build đầu cần đồng bộ font theo tài liệu dự án).
- Sau khi nhập font, giao diện sẽ hiển thị trạng thái khả dụng. Nếu có cảnh báo `woff2`, nên ưu tiên `ttf/otf/ttc` và điền đúng **Family Name** (không phải tên file).

### 7.6 Âm gốc và nhạc nền (BGM)

- **Âm gốc**: giữ hoặc tắt âm clip gốc (tắt không ảnh hưởng lồng tiếng/BGM).  
- **BGM**: chọn nhiều file; mỗi video chọn ngẫu nhiên một bài. File không có track âm thanh hoặc lỗi dò có thể được ghi trong log; video đó có thể không có BGM.  
- **Ducking**: hạ BGM khi giọng/âm gốc lớn. Nếu BGM nhỏ, tăng thanh trượt âm lượng.

### 7.7 Tham số khác (nếu có)

- Mỗi đoạn có **khoảng thời lượng, zoom, dịch khung** ngẫu nhiên nhẹ.  
- **Hiệu ứng chuyển cảnh / màu** có thể ở tab khác trong **Mẫu**.

### 7.8 Phân tích video tham chiếu (tạo mẫu một chạm)

- Trong trang **Mẫu**, dùng nút **Phân tích và tạo mẫu mới** với thư mục `video` (hoặc đường dẫn tuyệt đối). Hệ thống sẽ phân tích thời lượng, FPS, độ phân giải, bitrate và xu hướng cắt cảnh nhẹ.
- Kết quả chỉ tạo **một mẫu mới**, không ghi đè mẫu hiện có và không nhập các video tham chiếu vào thư viện sản phẩm.
- Cấu hình sinh ra theo hướng **quay tự nhiên** và vẫn giữ đầu ra **1080x1920**.

---

## 8. Tác vụ (render hàng loạt)

1. Mở **Tác vụ**.
2. Chọn **sản phẩm** và **mẫu**.
3. Đặt **số lượng** và **thư mục xuất** (ổ còn trống đủ).
4. Bấm **Bắt đầu tạo** (hoặc nút tương đương).

### 8.1 Hàng đợi và điều khiển

- Tác vụ xếp hàng (độ đồng thời tùy bản build). Xem tiến độ, trạng thái, log.  
- **Tạm dừng / Tiếp tục**: khi tạm dừng thường không khởi chạy tác vụ mới; hành vi FFmpeg đang chạy theo từng phiên bản (có bản render lại từ đầu sau khi tạm dừng).

### 8.2 Chống trùng lặp

- Dùng hash và quy tắc để tránh tổ hợp trùng.  
- Nếu đặt **N** video nhưng hàng đợi **ít hơn N**, có thể do ít tổ hợp clip, giới hạn tương đồng, v.v. Giao diện có thể báo **“chỉ N/N”** kèm lý do.  
- **Cách xử lý**: thêm nhiều clip khác nhau từng đoạn, hoặc nới tham số random nếu phần mềm cho phép.

### 8.3 File đầu ra

- Thường là **MP4 dọc**; bộ mã hóa có thể khác nhau từng máy (có cơ chế dự phòng).  
- Tác vụ hoàn thành: dùng **Hiện trong thư mục** (hoặc tương tự) để mở Explorer tại file.  
- **📱 Quét**: Điện thoại cùng **Wi‑Fi** với máy tính; bấm **Quét** ở tác vụ hoàn thành để hiện QR; mở bằng trình duyệt hoặc camera để phát qua LAN (cho phép cổng xem trước qua tường lửa nếu được hỏi).

---

## 9. Cập nhật

- Nếu đã cấu hình auto-update, sau khi tải xong có thể thấy **“Bản cập nhật sẵn sàng”**—khởi động lại để cài, hoặc để sau.  
- Nếu không, tải bộ cài mới từ trang nhà phân phối và cài đè.

---

## 10. Câu hỏi thường gặp

**H: Sao cần sao chép mã máy?**  
Đ: Một số nhà bán cần mã này để gắn thiết bị trên hệ thống của họ.

**H: Đổi máy vẫn dùng cùng mã?**  
Đ: Tùy chính sách; nhiều mã khóa lần kích hoạt đầu—liên hệ nhà phân phối để mở khóa hoặc mua mã mới.

**H: Mới cài đã báo “0/5” là sao?**  
Đ: Sản phẩm mặc định **chưa có clip**. Mẫu thường cần **ít nhất một video mỗi đoạn** (hook, show, detail…). Vào **Sản phẩm**, chọn đúng sản phẩm, thêm clip cho từng đoạn, rồi chạy **Tác vụ** lại.

**H: Render lỗi?**  
Đ: Đọc log tác vụ; kiểm tra dung lượng, quyền thư mục, file hỏng, đường dẫn ký tự lạ.

**H: Không có tiếng lồng tiếng?**  
Đ: Bật lồng tiếng, kho văn bản không rỗng, mạng ổn; kiểm tra âm lượng hệ thống.

---

## 11. Tài liệu thêm

- Kỹ thuật/nhà tích hợp: **`docs/requirements.md`**, **`docs/client-desktop-api.md`** (không bắt buộc cho người dùng cuối).

---

*Cảm ơn bạn đã sử dụng VideoGenerate.*

## 12. Lưu ý kiểm thử Windows và triển khai Linux
- Quy trình khuyến nghị: phát triển và kiểm thử hồi quy trên Windows trước.
- Trước khi phát hành, cần chạy ít nhất 1 lần render trên Linux với cùng template để đối chiếu kết quả.
- Nếu ASS không ăn đúng font trên Linux, hãy kiểm tra quyền thư mục font và ưu tiên `ttf/otf/ttc` thay vì chỉ dùng `woff2`.
- Khi sticker trùng tên, hệ thống lấy theo `ref` trong template (`bundled:*` hoặc `user:*`).

### Ghi chú âm thanh (v0.1.7)
- Để tránh video ngắn rơi vào đoạn nhạc mở đầu bị im lặng, hệ thống sẽ tự cắt phần im lặng đầu BGM trước khi mix. Nếu vẫn nhỏ, hãy tăng âm lượng BGM trong mẫu.

## 13. Clone Studio (Cau truc sao chep)
- Loi vao: menu trai `Clone`.
- Quy trinh: tai video tham chieu local -> AI phan tich blueprint -> bo sung vat lieu tung canh (tai len thu cong hoac AI tao) -> tao loat task clone -> duyet thu cong.
- Mac dinh: van ban tieng Viet, co the chuyen sang tieng Trung; Runway la kenh chinh, Pika la kenh du phong; dau ra van di qua he thong task hien tai.
- Luu y: tinh nang nay chi sao chep cau truc va phong cach, khong sao chep watermark/logo/dau hieu tai khoan ben thu ba.

## 14. Clone Studio 2.0 (Doi san pham, giu khung kich ban)
- Hoan thanh phan tich video tham chieu va bo sung vat lieu tung canh truoc.
- Khi xuat video, chon san pham muc tieu; moi lan tao se sinh mot session rieng tu cung mot khung kich ban.
- Session ho tro muc do bien the van ban (thap/trung binh/cao), mac dinh uu tien chat luong.
- Bang duyet ho tro loc theo session/trang thai/diem thap va cho phep giu/loai tung ket qua.
