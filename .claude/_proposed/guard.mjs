#!/usr/bin/env node
/**
 * PreToolUse guard — chặn cứng 2 thứ:
 *   1. Ghi/sửa/xoá file nằm trong protectedPaths (kể cả lách qua Bash)
 *   2. Hardcode secret vào code
 *
 * Đọc chính sách từ .claude/policy.json (file đó tự bảo vệ chính nó). Không dependency.
 * Input:  hook JSON trên stdin
 * Output: JSON deny trên stdout (hoặc im lặng nếu cho qua)
 *
 * Escape hatch: thêm comment `guard:allow-secret` trên đúng dòng bị chặn nhầm.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Bất kỳ lỗi bất ngờ nào -> cho qua. Hook chết không được làm chết session.
const allow = () => process.exit(0);

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// ---------- path helpers ----------

const norm = (p) =>
  String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();

/**
 * Chuẩn hoá CÂU LỆNH — khác `norm()` ở chỗ KHÔNG cắt dấu `/` cuối.
 * `norm()` viết cho đường dẫn; đem áp lên cả câu lệnh thì `rm -rf .git/`
 * biến thành `rm -rf .git`, làm mọi so khớp thư mục trượt sạch.
 */
const normCmd = (s) => String(s ?? '').replace(/\\/g, '/').toLowerCase();

function relToRoot(abs) {
  const r = norm(ROOT);
  const a = norm(abs);
  return a.startsWith(r + '/') ? a.slice(r.length + 1) : a;
}

function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

/** pattern là thư mục/file (khớp cả cây con) hoặc glob nếu chứa `*` */
function pathMatches(rel, pattern) {
  const p = norm(pattern).replace(/^\.\//, '');
  if (!p) return false;
  if (p.includes('*')) return globToRe(p).test(rel);
  return rel === p || rel.startsWith(p + '/');
}

/**
 * Dò xem lệnh shell có nhắc tới `pattern` như một ĐƯỜNG DẪN hay không.
 *
 * Trước đây dùng `cmd.includes(needle)` sau khi đã cắt dấu `/` cuối, nên needle
 * `.git` khớp luôn với `.gitignore`, `api.github.com`, `repo.git`, `.gitkeep`.
 * Giờ bắt buộc khớp ở ranh giới đường dẫn:
 *   - pattern là thư mục  -> ngay sau tên phải là `/`
 *   - pattern là file     -> ngay sau phải là hết chuỗi hoặc ký tự ngăn cách
 * Ký tự đứng trước phải là đầu chuỗi / khoảng trắng / nháy / `=` `(` `:` `;` `|` `&` `/`.
 * Giữ `/` trong nhóm đó để đường dẫn tuyệt đối vẫn khớp.
 */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRE = '(^|[\\s"\'`=(:;|&/])';

function cmdMentionsPath(cmd, pattern) {
  const raw = String(pattern).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  if (!raw || raw.includes('*')) return false;
  const body = escRe(raw.replace(/\/$/, ''));
  // Ngay sau tên phải là ranh giới: `/`, khoảng trắng, nháy, toán tử shell, hoặc
  // hết chuỗi. Thiếu khoảng trắng thì `mv .github old` lọt; thiếu `$` thì
  // `rm -rf .claude/hooks` lọt. An toàn vì PRE đã chặn phía trước —
  // `b.git ` và `api.github.com` đều trượt ở ký tự đứng trước.
  return new RegExp(PRE + body + '([/\\s"\'`):;|&]|$)').test(cmd);
}

/**
 * Lệnh có ghi ra đĩa không.
 *
 * Regex cũ `/>>?\s*\S/` khớp MỌI dấu `>`, kể cả `=>` của arrow function,
 * `->` của PHP, `>=` so sánh, và `2>&1`. Nó chặn nhầm 5 lần chỉ trong một phiên.
 * Bản mới yêu cầu `>` phải là redirect thật:
 *   - không đứng sau `= < > ! ~ + * / % -`  (loại `=>`, `->`, `-->`)
 *   - không theo sau bởi `=`                (loại `>=`)
 *   - đích phải là tên file, không phải toán tử shell (loại `2>&1`)
 */
const REDIRECT = /(?<![=<>!~+*/%-])>>?(?!=)\s*[^\s&|;>]/;

function writesToDisk(cmd) {
  return (
    /(^|[\s;&|(])(rm|mv|cp|tee|truncate|dd|chmod|chown)\s/.test(cmd) ||
    /(^|\s)(sed|perl)\s+(-\S*\s+)*-i/.test(cmd) ||
    REDIRECT.test(cmd) ||
    /\bgit\s+(rm|mv|checkout|restore|clean|apply)\b/.test(cmd)
  );
}

// ---------- secret rules ----------

/** Toàn bộ giá trị rõ ràng là placeholder -> không phải secret thật */
const PLACEHOLDER =
  /^(?:x{3,}|\*{3,}|\.{3,}|-+|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|%[^%]*%|placeholder|change[-_ ]?me|todo|tbd|dummy|fake|sample|foo|bar|baz|password|passwd|secret|apikey|api[-_ ]?key|token|admin|root|user|null|none|nil|undefined|true|false|\d+)$/i;

/**
 * Chứa từ khoá placeholder ở bất kỳ đâu -> coi là giá trị mẫu.
 * Chỉ áp dụng cho 2 rule generic bên dưới; các rule nhận dạng theo ĐÚNG định dạng
 * key thật (AKIA/sk-/ghp_/JWT/PEM/stripe) không hỏi tới hàm này nên vẫn chặn.
 */
const PLACEHOLDER_WORD =
  /\b(?:your|my|some|placeholder|example|change[-_ ]?me|changeme|todo|tbd|dummy|fake|sample|mock|test|x{3,}|here|redacted|insert|replace|enter)\b/i;

/** Giá trị thực ra là tham chiếu env / template -> hợp lệ */
const ENV_REF = /process\.env|os\.environ|getenv|ENV\[|Environment\.|config\.|\$\{|\{\{|<%|%\(|process\.argv/i;

const RULES = [
  { name: 'Private key block', re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'OpenAI/Anthropic API key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Stripe live key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  {
    name: 'JWT literal',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    name: 'Connection string kèm password',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:/\s]+:([^@\s"'`]{3,})@/,
    valueGroup: 1,
  },
  {
    name: 'Credential hardcode',
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|connection[_-]?string)\b\s*[:=]\s*["'`]([^"'`\n]{6,})["'`]/i,
    valueGroup: 1,
  },
];

function scanSecrets(text) {
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/guard:allow-secret/.test(line)) continue;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.valueGroup) {
        const v = (m[rule.valueGroup] || '').trim();
        if (!v || PLACEHOLDER.test(v) || PLACEHOLDER_WORD.test(v) || ENV_REF.test(v))
          continue;
      }
      return { rule: rule.name, line: i + 1 };
    }
  }
  return null;
}

// ---------- main ----------

let input, cfg;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  allow();
}
try {
  cfg = JSON.parse(readFileSync(resolve(ROOT, '.claude/policy.json'), 'utf8'));
} catch {
  allow();
}

const tool = input.tool_name || '';
const ti = input.tool_input || {};
const protectedPaths = cfg?.protectedPaths?.paths ?? [];
const protectReason = cfg?.protectedPaths?.reason ?? '';

// --- Bash: chặn ghi/xoá vào vùng protected qua shell ---
if (tool === 'Bash') {
  const cmd = normCmd(ti.command);
  if (!cmd) allow();
  if (writesToDisk(cmd)) {
    for (const p of protectedPaths) {
      if (cmdMentionsPath(cmd, p)) {
        deny(
          `Lệnh này ghi/xoá vào vùng được bảo vệ "${p}" (khai báo ở .claude/policy.json → protectedPaths). ${protectReason}\n` +
            `Không tìm cách lách. Nếu thật sự cần đổi, DỪNG lại và báo người dùng tự sửa.`,
        );
      }
    }
  }
  allow();
}

// --- Write/Edit/NotebookEdit ---
const filePath = ti.file_path || ti.notebook_path;
if (!filePath) allow();
const rel = relToRoot(filePath);

for (const p of protectedPaths) {
  if (pathMatches(rel, p)) {
    deny(
      `"${rel}" nằm trong vùng được bảo vệ "${p}" (khai báo ở .claude/policy.json → protectedPaths). ${protectReason}\n` +
        `Đừng ghi đè, đừng tạo file thay thế, đừng lách qua Bash. Nếu spec/luật cần đổi: DỪNG lại, nêu rõ chỗ cần đổi và để người dùng tự sửa.`,
    );
  }
}

if (cfg?.secretScan?.enabled) {
  const skip = cfg.secretScan.skipPaths ?? [];
  if (!skip.some((p) => pathMatches(rel, p))) {
    const text = ti.content ?? ti.new_string ?? ti.new_source ?? '';
    const hit = scanSecrets(text);
    if (hit) {
      deny(
        `Phát hiện secret hardcode trong nội dung định ghi vào "${rel}" — dòng ${hit.line} [${hit.rule}].\n` +
          `Đưa giá trị đó ra biến môi trường (.env, đọc qua process.env / os.environ / config) rồi ghi lại.\n` +
          `Nếu đây là false positive (giá trị mẫu, không phải secret thật), thêm comment "guard:allow-secret" vào chính dòng đó.`,
      );
    }
  }
}

allow();
