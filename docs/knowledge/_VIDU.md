---
ngày: 2026-08-13
files: src/components/DataGrid.tsx:212-260, src/styles/grid.css:44
commit: a1b2c3d
---

# Cột trong DataGrid render bằng flexbox, không phải `<table>`

*(File ví dụ — xoá khi bắt đầu dự án thật. Giữ lại để thấy một note tốt trông thế nào.)*

**Phát hiện**
`DataGrid` không dùng `<table>/<tr>/<td>`. Mỗi hàng là một `<div>` với
`display:flex`, mỗi cột là một `<div>` con có `flex-basis` tính từ `column.width`.
Chiều rộng cột được ghi vào biến CSS `--col-w-{index}` lúc runtime, không nằm trong markup.

**Vì sao khó tìm**
Grep `<td` hay `columnWidth` đều ra rỗng. Tên biến CSS được ghép chuỗi lúc chạy
(`--col-w-${i}`) nên tìm nguyên văn cũng không thấy. Phải lần từ chỗ gán
`style.setProperty` mới ra.

**Neo code**
- `src/components/DataGrid.tsx:228` — chỗ `setProperty` ghi `--col-w-*`
- `src/components/DataGrid.tsx:244` — nơi `flex-basis` đọc biến đó ra
- `src/styles/grid.css:44` — giá trị mặc định khi biến chưa được set

**Hệ quả cần nhớ**
Đổi chiều rộng cột phải sửa cả hai chỗ. Sửa mỗi CSS sẽ bị JS ghi đè ngay lần render sau.

**Kiểm chứng lại**
Mở DevTools, chọn một ô bất kỳ trong grid — thấy `flex-basis: var(--col-w-3)` là note còn đúng.
