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
   - Nhập **Cột từ / Cột đến**, **Hàng từ / Hàng đến**.
   - Bấm **Xem trước** để xem bảng preview đúng phần đã chọn.
   - Tick **"Dùng hàng đầu tiên làm tiêu đề cột"** nếu muốn xuất JSON dạng
     `[{cột1: giá_trị, ...}]` thay vì mảng 2 chiều.
   - **Copy CSV / Copy JSON**: copy thẳng vào clipboard.
   - **Tải CSV**: tải file `crawl-data.csv` về máy.
   - **Chọn lại vùng**: quay lại bước chọn khu vực khác.
5. Nhấn **ESC** bất cứ lúc nào trong lúc đang ở chế độ chọn để hủy.

## Giới hạn hiện tại

- Không tự gộp `colspan`/`rowspan` — mỗi ô được đếm là 1 cột dựa theo số phần tử ô thực tế.
- Chỉ crawl dữ liệu đang hiển thị trong DOM tại thời điểm bấm chọn (không tự động cuộn
  để load thêm dữ liệu ẩn/lazy-load).
- Hoạt động trên 1 khung (frame) chính của trang; chưa hỗ trợ chọn phần tử bên trong
  `<iframe>`.
