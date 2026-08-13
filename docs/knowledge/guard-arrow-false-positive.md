---
ngày: 2026-08-13
files: .claude/hooks/guard.mjs:169
commit: 32736d3
---

# Guard chặn nhầm mọi lệnh `node -e` có arrow function, không phải do tên đường dẫn

**Phát hiện**
Bộ dò "lệnh này có ghi ra đĩa không" trong `guard.mjs` dùng regex `/>>?\s*\S/`.
Nó khớp với **mọi** dấu `>` — kể cả `=>` trong arrow function JavaScript, `->` của PHP,
`>=` so sánh, và `2>&1`. Kết hợp với việc lệnh có nhắc tên một `protectedPath`,
guard kết luận đó là thao tác ghi vào vùng cấm và chặn.

Hậu quả: `curl ... | node -e "...c=>d+=c..."` bị chặn dù chỉ đọc. Trong một phiên
làm việc nó chặn nhầm **5 lần**, kể cả `git commit` mà commit message có chứa tên
thư mục cấm.

**Vì sao khó tìm**
Thông báo lỗi chỉ tên đường dẫn bị cấm nên rất dễ kết luận sai rằng nguyên nhân là
"lệnh có nhắc tên vùng cấm". Thực tế đó chỉ là điều kiện thứ hai — điều kiện thứ nhất
(`writesToDisk`) mới là chỗ hỏng, và nó âm thầm đúng với mọi arrow function.
Phải đọc kỹ cả hai điều kiện mới thấy.

**Neo code**
- `.claude/hooks/guard.mjs:169` — dòng `/>>?\s*\S/.test(cmd)`
- `.claude/hooks/guard.mjs:166-170` — cả khối `writesToDisk`

**Bản vá đề xuất** (đã kiểm chứng, chưa áp dụng)

Thay dòng 169:
```js
    />>?\s*\S/.test(cmd) ||
```
bằng:
```js
    /(?<![=<>!~+*/%-])>>?(?!=)\s*[^\s&|;>]/.test(cmd) ||
```

Ý nghĩa: `>` không được đứng sau `= < > ! ~ + * / % -` (loại `=>`, `->`, `-->`),
không được theo sau bởi `=` (loại `>=`), và đích phải là tên file chứ không phải
toán tử shell (loại `2>&1`).

Đối chiếu trên bộ 20 ca thử: regex cũ sai 8, regex mới sai 1.

**Giới hạn còn lại**
`echo $((a>b))` và `grep "a>b" f` vẫn bị chặn nhầm — `>` nằm trong chuỗi hoặc biểu
thức số học thì không tách được nếu không parse shell thật sự. Chấp nhận, vì nó
fail an toàn: chặn nhầm chứ không bỏ sót.

**Kiểm chứng lại**
```bash
printf '{"tool_name":"Bash","tool_input":{"command":"node -e \\"x.on(1,c=>c)\\""}}' \
  | node .claude/hooks/guard.mjs
```
Không in gì = đã vá. In JSON `deny` = vẫn còn bug.

**Vì sao note này tồn tại thay vì commit thẳng bản vá**
`.claude/hooks/` nằm trong `protectedPaths` — AI không sửa được, kể cả để vá lỗi của
chính nó. Đó là chủ ý: cơ chế cưỡng chế chỉ người mới đổi được. Bản vá nằm ở đây để
người đọc, duyệt, rồi tự áp.
