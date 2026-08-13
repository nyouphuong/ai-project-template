---
ngày: 2026-08-13
files: .claude/hooks/guard.mjs:172-174
commit: e7deb2c
---

# Thêm `.git/` vào protectedPaths làm hỏng mọi lệnh có `.gitignore` hoặc `github.com`

**Phát hiện**
Khối kiểm tra Bash so khớp đường dẫn cấm bằng `cmd.includes(needle)` thuần, sau khi
`norm()` đã cắt mất dấu `/` cuối. Nên `.git/` biến thành needle `.git`, và khớp với
bất kỳ chuỗi con nào:

| Chuỗi trong lệnh | Khớp vì | Hậu quả |
|---|---|---|
| `.gitignore` | chứa `.git` | không ghi được `.gitignore` |
| `api.github.com` | `.github` chứa `.git` | không gọi được API GitHub |
| `repo.git` | chứa `.git` | không clone được |
| `.gitkeep` | chứa `.git` | không tạo được placeholder |

Đo trên 4 lệnh thường gặp: **cả 4 đều bị chặn nhầm**. Bốn lệnh thật sự nguy hiểm
(sửa workflow, xoá `.git/`, đổi remote, xoá spec) vẫn bị chặn đúng.

**Vì sao khó tìm**
Hồi quy này chỉ xuất hiện *sau khi* thêm `.git/` và `.github/` vào `protectedPaths`.
Trước đó các needle (`docs/ba/`, `.claude/hooks/`) đều đủ dài và đặc thù nên không
đụng chuỗi nào khác — bug tồn tại từ đầu nhưng im lặng. Thông báo lỗi lại chỉ tên
vùng cấm nên rất dễ tưởng mình gõ nhầm đường dẫn.

**Neo code**
- `.claude/hooks/guard.mjs:173` — `const needle = norm(p).replace(/^\.\//, '')`
- `.claude/hooks/guard.mjs:174` — `cmd.includes(needle)`
- `.claude/hooks/guard.mjs:41` — `norm()` cắt `/` cuối, làm mất thông tin "đây là thư mục"

**Bản vá đề xuất** (chưa áp dụng)

Thay hai dòng 173-174 bằng so khớp theo **ranh giới đường dẫn** thay vì chuỗi con:

```js
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const p of protectedPaths) {
      const raw = String(p).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      if (!raw || raw.includes('*')) continue;
      const body = esc(raw.replace(/\/$/, ''));
      const PRE = '(^|[\\s"\'`=(:;|&/])';
      const re = raw.endsWith('/')
        ? new RegExp(PRE + body + '/')                       // thư mục: bắt buộc có / sau
        : new RegExp(PRE + body + '([\\s"\'`):;|&]|$)');     // file: kết thúc ở ranh giới
      if (re.test(cmd)) {
        deny(/* ...giữ nguyên... */);
      }
    }
```

Vì sao ăn: `.git/` yêu cầu ngay sau `.git` phải là `/`, nên `.gitignore` (sau là `i`)
và `repo.git ` (sau là khoảng trắng) đều trượt. `.github` trong `api.github.com` có ký
tự đứng trước là `i` — không nằm trong nhóm ranh giới — nên cũng trượt.
Giữ `/` trong nhóm ký tự đứng trước để đường dẫn tuyệt đối vẫn khớp.

**Liên quan**
Bug thứ hai trong cùng khối: xem [Guard chặn nhầm arrow function](guard-arrow-false-positive.md).
Hai bản vá độc lập nhau, nên áp riêng lẻ được.

**Kiểm chứng lại**
```bash
printf '{"tool_name":"Bash","tool_input":{"command":"echo x >> .gitignore"}}' \
  | node .claude/hooks/guard.mjs
```
Không in gì = đã vá. In JSON `deny` = vẫn còn bug.

**Vì sao note thay vì commit thẳng bản vá**
`.claude/hooks/` nằm trong `protectedPaths`. Đó là chủ ý — cơ chế cưỡng chế chỉ người
mới sửa được, kể cả khi lỗi nằm trong chính nó.
