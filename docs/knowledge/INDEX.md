# Sổ tay codebase

> **ĐỌC FILE NÀY TRƯỚC KHI ĐI TÌM BẤT CỨ THỨ GÌ TRONG CODE.**
> Mỗi phát hiện = 1 dòng ở đây + 1 file riêng. Chỉ mở file khi thấy dòng đó liên quan.
> Giữ mỗi dòng **dưới 15 từ** — đây là file bị đọc thường xuyên thứ hai sau `CLAUDE.md`.

Format: `- [tiêu đề](file.md) — mồi nhử để biết có nên mở không`

## Kiến trúc & layout
- *(chưa có)*

## Cạm bẫy / hành vi bất ngờ
- *(chưa có)*

## Quy ước ngầm (code không nói ra)
- *(chưa có)*

## Tích hợp ngoài / hạ tầng
- *(chưa có)*

---

## Note có còn đúng không?

Mỗi note ghi `commit:` là hash lúc viết. Kiểm tra file đó đã đổi chưa:

```bash
git log --oneline <commit>..HEAD -- <đường/dẫn/file>
```

Rỗng = note còn nguyên giá trị. Có output = code đã đổi, **verify lại trước khi tin**,
sửa note rồi cập nhật `commit:`.

## Luật ghi note

**GHI khi:** tốn hơn ~5 phút / hơn 3 file mới hiểu ra một điều không hiển nhiên.

**KHÔNG ghi:**
- Thứ đọc code là thấy ngay (tên hàm làm gì, kiểu dữ liệu…)
- Chuyện chỉ đúng một lần (giá trị debug, kết quả một lần chạy)
- Thứ đã có trong `docs/ba/` hoặc `docs/governance/`
- Lịch sử sửa lỗi — cái đó để git log lo

Note sai còn tệ hơn không có note. Thà bỏ trống còn hơn ghi đoán.
