# [Tên dự án]

> Claude đọc file này MỌI session. Ngân sách: **≤500 token**.
> Dài hơn → Claude bỏ qua nửa nội dung. Chi tiết để ở file khác, chỉ trỏ tới.

## Dự án
[1-2 câu: làm gì, cho ai]

## Lệnh build/test/lint
Đọc `.claude/stack.json` → `commands`. ĐỪNG đoán, đừng dò `package.json`.

## Sổ tay codebase — ĐỌC TRƯỚC KHI ĐI TÌM
`docs/knowledge/INDEX.md` = mục lục những thứ đã tốn công tìm ra. Đọc nó **trước** khi
grep hay giao `explorer` — nhiều khi câu trả lời có sẵn ở đó.
Tốn >5 phút hoặc >3 file mới hiểu ra điều không hiển nhiên → GHI note mới theo
`docs/knowledge/_TEMPLATE.md` rồi thêm 1 dòng vào INDEX. Bắt buộc kèm `file:line` + ngày + commit.
KHÔNG ghi thứ đọc code là thấy ngay. Note sai tệ hơn không có note.

## Giao việc cho subagent (luật tiết kiệm token)

**GIAO** khi phải quét **>3–4 file lớn**:
- Tìm code, "X nằm đâu", "chỗ nào dùng Y", "flow Z qua file nào" → `explorer`
- Đối chiếu code với spec `docs/ba/` → `spec-auditor`

**TỰ LÀM** khi: đã biết đúng file cần sửa · việc 1–2 file · lệnh shell ngắn.
Lý do: subagent nạp lại system prompt + CLAUDE.md từ đầu, trả cold cache → lạm dụng đắt hơn tự làm.
Subagent KHÔNG thấy hội thoại này → prompt giao việc phải tự đủ nghĩa.

## Cách trả lời
Xong việc ĐỪNG tóm tắt lại code vừa viết — tao đọc code là biết.
Chỉ báo: đã làm gì, còn vướng gì. Thiếu thông tin để quyết → DỪNG, hỏi, đừng đoán.

## Vùng cấm (hook chặn cứng, không lách được kể cả qua Bash)
`docs/ba/` · `docs/governance/` · `.claude/policy.json` · `.claude/settings.json` · `.claude/hooks/`
(`.claude/stack.json` KHÔNG cấm — cứ sửa/điền hộ thoải mái.)

Cần đổi mấy chỗ đó → **DỪNG**, nói rõ chỗ cần đổi, để người dùng tự sửa.
Secret hardcode bị chặn ghi → dùng `.env` + đọc qua biến môi trường.

## Quy trình task
1. `tasks/current.md` = việc đang làm. Đọc trước khi code.
2. Xong → tick checkbox, log quyết định quan trọng vào cuối file task.
3. Việc phát sinh → thêm `tasks/backlog.md`. KHÔNG tự làm ngoài phạm vi đang chốt.
4. Commit: `[task-id] mô tả ngắn`

## Trỏ nhanh (đọc khi cần, đừng load hết)
`docs/ba/` nghiệp vụ · `docs/governance/rules.md` luật chi tiết · `tasks/backlog.md` việc chưa làm
