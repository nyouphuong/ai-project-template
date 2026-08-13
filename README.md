# AI Project Template

Template cho dự án dùng Claude Code: **ép** AI code đúng phạm vi và tốn ít token,
bằng cơ chế cưỡng chế của harness chứ không bằng lời khuyên trong văn bản.

## Setup dự án mới

1. Copy toàn bộ folder này làm gốc.
2. Sửa **`.claude/stack.json`** → `commands`: điền lệnh thật
   (install/dev/build/test/lint/format/typecheck). AI sửa được file này, nhờ nó điền hộ cũng được.
3. Xem lại **`.claude/policy.json`** — `protectedPaths.paths` (vùng AI không được ghi)
   và `secretScan.skipPaths`. **Chỉ mày sửa được**, AI không đụng vào được.
4. Sửa `CLAUDE.md` — điền tên dự án, stack. **Giữ ≤500 token.**
5. Viết spec thật vào `docs/ba/`, xoá file mẫu.
6. Điền task thật vào `tasks/current.md` + `tasks/backlog.md`.

Yêu cầu: **Node.js** (chạy hook). Không có node → hook tự bỏ qua, không làm chết session.

## Áp vào dự án ĐÃ CÓ SẴN

```bash
cd /duong/dan/du-an-cu
node /d/AI_Task/ai-project-template/install.mjs --dry-run   # xem trước, không ghi gì
node /d/AI_Task/ai-project-template/install.mjs             # cài thật
```

Installer tự làm:

| Việc | Chi tiết |
|---|---|
| Copy `.claude/`, `CLAUDE.md`, `.gitattributes` | **Không đè** file sẵn có — chỉ báo để mày tự gộp |
| Bắt bẫy `.gitignore` | Cảnh báo nếu repo đang ignore `.claude/` (làm mất sạch hook khi đồng đội clone) |
| Dò stack → `stack.json` | Node/pnpm·yarn·bun, Python/uv·poetry, Go, Rust, .NET, Maven, Gradle, PHP — đọc luôn `scripts` trong `package.json` |
| Sinh `policy.json` | Chỉ đưa vào `protectedPaths` những vùng **có thật** trong repo: `db/migrations/`, `terraform/`, `.github/workflows/`, `proto/`, `openapi.yaml`… |
| Rà `permissions.deny` | Chỉ nhắc thư mục build có thật mà deny-list chưa phủ |

Cờ `--force` cho phép ghi đè `policy.json`/`stack.json` đã có.

**Phần installer KHÔNG làm thay được** (cần người đọc hiểu nghiệp vụ): quyết định cuối cùng
vùng nào đáng khoá. Nó chỉ đề xuất theo pattern thư mục. Rà lại `policy.json` trước khi tin.

## 3 cơ chế tiết kiệm token

**1. CLAUDE.md ngắn.** Chỉ file này được đọc tự động mỗi session. Mọi thứ khác
(`docs/ba/`, `docs/governance/`) chỉ nạp khi thật sự cần. Dài quá thì Claude bỏ qua nửa nội dung.

**2. Chặn đọc rác.** `.claude/settings.json` → `permissions.deny` khoá tool `Read`
với `node_modules/`, `dist/`, lockfile, `*.min.js`, `.env`… Đây là chặn ở tầng
permission — cưỡng chế thật, khác `.claudeignore` vốn chỉ là gợi ý.

**3. Subagent cô lập context.** `explorer` (haiku) quét codebase trong context
riêng, chỉ trả về kết luận + `file:line`. Hàng chục file đọc dở không lọt vào
context chính. Luật khi nào giao / khi nào tự làm nằm trong `CLAUDE.md`.

## Governance được cưỡng chế thế nào

`.claude/hooks/guard.mjs` chạy ở `PreToolUse`, chặn **cứng** (không phải cảnh báo):

| Chặn | Phạm vi |
|---|---|
| Ghi/sửa/xoá vùng `protectedPaths` | `Write`, `Edit`, `NotebookEdit`, và cả `Bash` (`rm`, `mv`, `>`, `sed -i`, `git checkout`…) |
| Hardcode secret | Nội dung sắp ghi: AWS key, GitHub token, `sk-`, JWT, PEM, conn string có password, gán credential |

**Vì sao tách `policy.json` khỏi `stack.json`:** nếu chính sách nằm chung với lệnh
build thì phải chọn một trong hai điều dở — hoặc khoá cả file (AI không giúp điền
`commands` được), hoặc mở cả file (AI tự xoá được vùng cấm của chính nó). Tách ra thì
`policy.json` + `settings.json` + `hooks/` **tự nằm trong vùng cấm** (sợi xích không do
con chó giữ), còn `stack.json` mở cho AI sửa thoải mái.

**False positive?** Thêm comment `guard:allow-secret` vào đúng dòng bị chặn.
Hook so khớp theo chuỗi con nên lệnh Bash chỉ *nhắc tên* vùng cấm kèm động từ
ghi/xoá cũng bị chặn — chấp nhận thà chặn nhầm còn hơn bỏ sót.

## Quy trình làm việc

1. Viết spec vào `docs/ba/` **trước** khi kêu AI code.
2. Update `tasks/current.md`.
3. Code. Cần tìm hiểu codebase → bảo Claude giao cho `explorer`.
4. Xong → giao `spec-auditor` đối chiếu code với spec trước khi commit.
5. Tick checkbox, log quyết định quan trọng, chuyển task tiếp từ `tasks/backlog.md`.
6. Định kỳ dọn `tasks/current.md` cho khỏi phình.

## Cấu trúc

```
.claude/
  stack.json        ← lệnh build/test của dự án (AI SỬA ĐƯỢC)
  policy.json       ← vùng cấm + secret scan    (AI không sửa được)
  settings.json     ← hook + permissions.deny   (AI không sửa được)
  hooks/guard.mjs   ← logic chặn cứng           (AI không sửa được)
  agents/           ← explorer, spec-auditor
docs/
  ba/               ← spec đã chốt             (AI không sửa được)
  governance/       ← luật dự án               (AI không sửa được)
tasks/
  current.md        ← việc đang làm
  backlog.md        ← việc chưa làm
CLAUDE.md           ← ≤500 token, load mỗi session
```
