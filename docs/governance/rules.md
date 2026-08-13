# Quy tắc chi tiết (Governance)

> Chỉ đọc file này khi Claude cần quyết định 1 việc nằm ngoài quy tắc ngắn ở CLAUDE.md.

## Phạm vi được phép tự quyết
- Đặt tên biến, hàm, tổ chức file nội bộ trong 1 module: TỰ QUYẾT
- Chọn thư viện mới (thêm dependency): PHẢI HỎI trước
- Đổi schema DB đã có data: PHẢI HỎI trước, đề xuất migration an toàn
- Xóa file/code cũ: PHẢI HỎI trước, trừ khi task ghi rõ "dọn dẹp X"

## Coding convention
- [Điền theo dự án: naming convention, indentation, comment style...]

## Bảo mật
- Không log thông tin nhạy cảm (password, token, PII khách hàng)
- Input từ user luôn phải validate/sanitize trước khi query DB

## Khi Claude không chắc
Nếu task mơ hồ hoặc thiếu thông tin để quyết định đúng — DỪNG lại hỏi,
không tự đoán rồi code đại, tốn token sửa lại còn tốn hơn hỏi trước.
