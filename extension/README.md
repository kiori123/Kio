# Khoanh Vùng Crawl Dữ Liệu

Extension Chrome/Edge (Manifest V3) cho phép: bấm chọn 1 khu vực dữ liệu (bảng `<table>`
hoặc lưới div bất kỳ) trên trang, sau đó chọn **cột từ – đến** và **hàng từ – đến** để
crawl đúng phần dữ liệu cần lấy, rồi copy/tải ra CSV hoặc JSON.

## Cài đặt (chế độ Developer / Unpacked)

1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode** (góc trên phải).
3. Chọn **Load unpacked** và trỏ tới thư mục `extension/` này.
4. Ghim icon extension lên thanh công cụ cho dễ bấm.

## Cách dùng

1. Vào trang web có bảng/dữ liệu cần crawl.
2. Bấm icon extension để **bật chế độ chọn vùng** — di chuột trên trang sẽ thấy khung
   xanh dương highlight từng phần tử đang hover.
3. Bấm vào bảng hoặc khu vực chứa dữ liệu (vd bấm vào bất kỳ đâu trong `<table>`, hoặc
   vào 1 div-grid). Extension sẽ:
   - Tự tìm bảng `<table>` gần nhất nếu có (đọc chính xác theo `<tr>`/`<td>`/`<th>`).
   - Nếu không phải table, coi các phần tử con trực tiếp là "hàng", con của mỗi hàng là
     "cột" (dùng được cho layout dạng div/grid).
   - Hiện số thứ tự cột (C1, C2, …) phía trên hàng đầu, số thứ tự hàng (H1, H2, …) bên
     trái mỗi hàng, để bạn biết chính xác cần chọn từ đâu đến đâu.
4. Panel điều khiển hiện ở góc phải màn hình:
   - Nếu số hàng/cột phát hiện được không đúng với bảng bạn thấy trên màn hình (thường
     do bấm trúng ngay 1 ô lẻ trong layout dạng div), bấm **⬆ Mở rộng vùng** để leo lên
     khu vực cha (vd từ "1 hàng" lên "cả lưới"), hoặc **⬇ Thu hẹp vùng** để quay lại vùng
     nhỏ hơn trước đó. Theo dõi số "Phát hiện: N hàng × M cột" và các badge C1/H1 để biết
     khi nào đã đúng.
   - Nhập **Cột từ / Cột đến**, **Hàng từ / Hàng đến**.
   - Bấm **Xem trước** để xem bảng preview đúng phần đã chọn.
   - Tick **"Dùng hàng đầu tiên làm tiêu đề cột"** nếu muốn xuất JSON dạng
     `[{cột1: giá_trị, ...}]` thay vì mảng 2 chiều.
   - **Copy CSV / Copy JSON**: copy thẳng vào clipboard.
   - **Tải CSV**: tải file `crawl-data.csv` về máy.
   - **Chọn lại vùng**: quay lại bước chọn khu vực khác.
5. Nhấn **ESC** bất cứ lúc nào trong lúc đang ở chế độ chọn để hủy.

## Crawl nhiều trang (phân trang) rồi gộp thành 1 file

Ví dụ: bảng 3 cột, mỗi trang 10 dòng, có 5 trang muốn lấy hết.

1. Ở **trang 1**: chọn vùng như bình thường, chỉnh Cột/Hàng từ–đến bao gồm luôn **hàng
   tiêu đề** (nếu có) → bấm **➕ Thêm vào giỏ (crawl nhiều trang)**.
2. Chuyển sang **trang 2**: bấm icon extension → chọn lại vùng → lần này chỉnh **Hàng từ**
   bắt đầu từ hàng dữ liệu đầu tiên (bỏ qua hàng tiêu đề, vì đã có ở trang 1 rồi) → bấm
   **➕ Thêm vào giỏ**.
3. Lặp lại bước 2 cho **trang 3, 4, 5**.
4. Một thanh nhỏ **"🧺 Giỏ: N dòng"** luôn hiện ở góc dưới-trái màn hình, cộng dồn số dòng
   qua từng lần thêm — kể cả khi bạn chuyển trang/tải lại trang, giỏ vẫn còn nguyên (lưu ở
   `chrome.storage.local`, không phụ thuộc tab hay lần tải trang).
5. Xong cả 5 trang: bấm **Tải CSV** hoặc **Copy CSV** ngay trên thanh giỏ để lấy ra 1 file
   duy nhất gồm toàn bộ dữ liệu đã gom (1 header + 50 dòng dữ liệu ví dụ trên).
6. Bấm **Xoá giỏ** khi muốn làm mới, bắt đầu 1 lượt gom khác.

## Giới hạn hiện tại

- Không tự gộp `colspan`/`rowspan` — mỗi ô được đếm là 1 cột dựa theo số phần tử ô thực tế.
- Chỉ crawl dữ liệu đang hiển thị trong DOM tại thời điểm bấm chọn (không tự động cuộn
  để load thêm dữ liệu ẩn/lazy-load).
- Hoạt động trên 1 khung (frame) chính của trang; chưa hỗ trợ chọn phần tử bên trong
  `<iframe>`.
