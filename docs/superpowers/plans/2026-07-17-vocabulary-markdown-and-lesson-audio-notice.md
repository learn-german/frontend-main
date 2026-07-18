# Vocabulary Markdown & Lesson Audio Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển tab Từ vựng (Wortschatz) sang soạn bằng Markdown với cú pháp `{{từ}}` click-to-speak, bỏ audio player mp3 khỏi tab Hören trong trang bài học (mp3 chỉ phát lúc làm bài tập), và thêm đoạn hướng dẫn cho tab Hören/Lesen.

**Architecture:** Cột DB mới `lessons.vocabulary_md` (markdown) thay thế cột `vocabulary` (JSONB, giữ nguyên không xoá). `MarkdownBlock` (component markdown dùng chung, đã có cho grammar/speaking/writing) được mở rộng với prop `onWordClick` để render `{{từ}}` thành nút highlight gọi Web Speech API. `LessonDetailPage.tsx` và `AdminLessonEditor.tsx` cập nhật theo field mới; `ListeningClipPlayer.tsx` bị xoá vì không còn dùng ở đâu sau khi bỏ audio khỏi trang bài học.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Supabase (Postgres + PostgREST), react-markdown + remark-gfm (đã có sẵn, không thêm package mới).

## Global Constraints

- Không dùng `any` trong TypeScript — dùng type cụ thể hoặc `unknown`.
- Nội dung hiển thị cho user: tiếng Việt. Tên biến/hàm/comment kỹ thuật: tiếng Anh.
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua `npm run gen:types` hoặc tool MCP `generate_typescript_types`.
- Không tắt RLS trên bất kỳ bảng nào; không đổi cơ chế chấm điểm quiz (`submit-quiz` Edge Function không đổi).
- `SUPABASE_SERVICE_ROLE_KEY` không xuất hiện trong code frontend.
- Cột `lessons.vocabulary` (JSONB) giữ nguyên trong DB, không DROP COLUMN.
- Dùng `showToast()` cho mọi thông báo, không dùng `window.alert()`.

---

## Task 1: Database — cột `vocabulary_md`, backfill dữ liệu, regenerate types

**Files:**
- Create: `supabase/migrations/20260717000020_vocabulary_markdown.sql`
- Modify: `src/lib/database.types.ts` (tự động, qua tool — không sửa tay)

**Interfaces:**
- Produces: cột `lessons.vocabulary_md TEXT` (nullable), đã backfill dữ liệu markdown từ `lessons.vocabulary` JSONB hiện có. Format mỗi từ:
  ```
  ### {{<de>}} — <vi>
  *<pronunciation>*

  🇩🇪 <exampleDe>
  🇻🇳 <exampleVi>
  ```
  (bỏ dòng nào field tương ứng rỗng), các khối cách nhau 1 dòng trống.

- [ ] **Step 1: Viết migration file**

Tạo `supabase/migrations/20260717000020_vocabulary_markdown.sql`:

```sql
-- Thay thế cấu trúc vocabulary JSONB bằng markdown tự do, giống pattern
-- grammar_md/speaking_md/writing_prompt_md. Cột `vocabulary` JSONB cũ được
-- giữ nguyên (không DROP) làm nguồn dữ liệu gốc để đối chiếu nếu cần.
ALTER TABLE lessons ADD COLUMN vocabulary_md TEXT;

DO $$
DECLARE
  lesson_row RECORD;
  vocab_item JSONB;
  block TEXT;
  blocks TEXT[];
  de TEXT;
  vi TEXT;
  pronunciation TEXT;
  example_de TEXT;
  example_vi TEXT;
BEGIN
  FOR lesson_row IN SELECT id, vocabulary FROM lessons WHERE jsonb_array_length(vocabulary) > 0 LOOP
    blocks := ARRAY[]::TEXT[];

    FOR vocab_item IN SELECT * FROM jsonb_array_elements(lesson_row.vocabulary) LOOP
      de := vocab_item->>'de';
      vi := NULLIF(vocab_item->>'vi', '');
      pronunciation := NULLIF(vocab_item->>'pronunciation', '');
      example_de := NULLIF(vocab_item->>'exampleDe', '');
      example_vi := NULLIF(vocab_item->>'exampleVi', '');

      block := '### {{' || de || '}}';
      IF vi IS NOT NULL THEN
        block := block || ' — ' || vi;
      END IF;

      IF pronunciation IS NOT NULL THEN
        block := block || E'\n' || '*' || pronunciation || '*';
      END IF;

      IF example_de IS NOT NULL THEN
        block := block || E'\n\n' || '🇩🇪 ' || example_de;
      END IF;

      IF example_vi IS NOT NULL THEN
        block := block || E'\n' || '🇻🇳 ' || example_vi;
      END IF;

      blocks := array_append(blocks, block);
    END LOOP;

    UPDATE lessons SET vocabulary_md = array_to_string(blocks, E'\n\n') WHERE id = lesson_row.id;
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply migration**

Dùng Supabase MCP tool `apply_migration` (name: `vocabulary_markdown`, đúng nội dung file trên). Nếu không có MCP tool khả dụng trong môi trường thực thi, dùng `supabase db push` qua Supabase CLI (yêu cầu `supabase link` đã thiết lập).

- [ ] **Step 3: Verify backfill bằng SQL**

Chạy qua Supabase MCP tool `execute_sql`:

```sql
SELECT id,
       jsonb_array_length(vocabulary) AS old_count,
       (SELECT count(*) FROM regexp_matches(vocabulary_md, '\{\{[^{}]+\}\}', 'g')) AS new_count
FROM lessons
WHERE jsonb_array_length(vocabulary) > 0
ORDER BY id;
```

Expected: `old_count` = `new_count` cho mọi hàng (đặc biệt các bài mẫu `a1-l1` (5), `a1-l2` (4), `a2-l1` (4), `b1-l1` (4) nếu đã seed sẵn trong DB thật — nếu DB thật có nội dung khác mockData thì vẫn phải khớp `old_count = new_count` theo từng hàng, không so với số cụ thể ở trên).

- [ ] **Step 4: Regenerate `database.types.ts`**

Dùng Supabase MCP tool `generate_typescript_types`, ghi đè `src/lib/database.types.ts`. Nếu không có MCP tool khả dụng, chạy `npm run gen:types` (yêu cầu Supabase CLI đã `link` hoặc local stack đang chạy).

Expected: file có `vocabulary_md: string | null` trong `Row`/`Insert`/`Update` của bảng `lessons` (cạnh `vocabulary: Json` cũ, vẫn còn nguyên).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000020_vocabulary_markdown.sql src/lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(db): add lessons.vocabulary_md column, backfill from existing vocabulary JSONB

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `MarkdownBlock` — cú pháp `{{từ}}` click-to-speak

**Files:**
- Modify: `src/components/MarkdownBlock.tsx`

**Interfaces:**
- Consumes: không phụ thuộc task nào khác.
- Produces:
  - `MarkdownBlock` nhận thêm prop tuỳ chọn `onWordClick?: (word: string) => void`.
  - `export function countHighlightedWords(content: string | undefined): number` — đếm số `{{...}}` trong 1 chuỗi markdown, dùng ở Task 3 (badge số từ vựng, counter Dashboard).

- [ ] **Step 1: Đọc lại file hiện tại để xác nhận vị trí chèn code**

File: `src/components/MarkdownBlock.tsx`. Hàm `preprocessMarkdown` (export) nằm ở dòng 82-84. Component `MarkdownBlock` nằm ở dòng 213-221 (cuối file).

- [ ] **Step 2: Thêm hằng số + helper cho cú pháp `{{từ}}`, ngay trước `export function preprocessMarkdown`**

Chèn đoạn sau vào `src/components/MarkdownBlock.tsx`, ngay trước dòng `export function preprocessMarkdown(content: string): string {` (dòng 82):

```typescript
const VOCAB_WORD_PATTERN = /\{\{([^{}]+)\}\}/g;
const PRONOUNCE_SCHEME = "pronounce:";

// Counts {{word}} occurrences in raw markdown — used by callers that show a
// vocabulary count (lesson tab badge, dashboard "next lesson" card) without
// needing to render the content.
export function countHighlightedWords(content: string | undefined): number {
  if (!content) return 0;
  return (content.match(VOCAB_WORD_PATTERN) ?? []).length;
}

// Rewrites {{word}} into a markdown link `[word](pronounce:<index>)`, index
// referencing into `words` (populated in encounter order). An index rather
// than the URL-encoded word itself avoids markdown link syntax breaking on
// words containing "(" or ")", which encodeURIComponent does not escape.
function wrapPronounceWords(content: string, words: string[]): string {
  return content.replace(VOCAB_WORD_PATTERN, (_match, word: string) => {
    const index = words.length;
    words.push(word);
    return `[${word}](${PRONOUNCE_SCHEME}${index})`;
  });
}

```

- [ ] **Step 3: Mở rộng `MarkdownBlock` với `onWordClick`**

Trong `src/components/MarkdownBlock.tsx`, thay toàn bộ khối cuối file (dòng 213-221):

```typescript
export const MarkdownBlock: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {preprocessMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
};
```

bằng:

```typescript
export const MarkdownBlock: React.FC<{
  content: string;
  className?: string;
  onWordClick?: (word: string) => void;
}> = ({ content, className, onWordClick }) => {
  const pronounceWords: string[] = [];
  const preprocessed = preprocessMarkdown(content);
  const processedContent = onWordClick ? wrapPronounceWords(preprocessed, pronounceWords) : preprocessed;

  const activeComponents: Components = onWordClick
    ? {
        ...components,
        a: ({ href, children }) => {
          if (href?.startsWith(PRONOUNCE_SCHEME)) {
            const word = pronounceWords[Number(href.slice(PRONOUNCE_SCHEME.length))];
            return (
              <button
                type="button"
                onClick={() => onWordClick(word)}
                className="font-display font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 active:scale-95 rounded px-1 -mx-0.5 transition cursor-pointer"
              >
                {children}
              </button>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">
              {children}
            </a>
          );
        },
      }
    : components;

  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={activeComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
```

- [ ] **Step 4: Kiểm tra type-check**

Run: `npm run lint`
Expected: 0 lỗi liên quan đến `src/components/MarkdownBlock.tsx` (prop `onWordClick` là optional nên không có consumer nào khác trong repo bị ảnh hưởng ở bước này).

- [ ] **Step 5: Commit**

```bash
git add src/components/MarkdownBlock.tsx
git commit -m "$(cat <<'EOF'
feat: add {{word}} click-to-speak syntax to MarkdownBlock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Đổi `vocabulary` → `vocabularyMd` xuyên suốt app

Task này đổi field trên `Lesson`/DB đồng thời ở mọi nơi tiêu thụ nó (type, query, admin editor UI, trang bài học, dashboard, mock data) — các file này phụ thuộc lẫn nhau chặt (đổi type ở `appTypes.ts` một mình sẽ làm vỡ compile ở các file còn lại), nên gộp thành 1 task/1 commit duy nhất để repo luôn ở trạng thái compile được sau mỗi lần commit.

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useModules.ts`
- Modify: `src/data/mockData.ts`
- Modify: `src/pages/admin/AdminContentSection.tsx`
- Modify: `src/pages/admin/AdminLessonEditor.tsx`
- Modify: `src/pages/LessonDetailPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `MarkdownBlock`'s `onWordClick` prop + `countHighlightedWords` (Task 2).
- Produces: `Lesson.vocabularyMd?: string` (thay cho `Lesson.vocabulary: VocabularyItem[]`), dùng bởi mọi task sau.

- [ ] **Step 1: `appTypes.ts` — đổi type**

Trong `src/lib/appTypes.ts`, xoá interface `VocabularyItem` (dòng 13-19):

```typescript
export interface VocabularyItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

```

Đổi dòng 60 (`  vocabulary: VocabularyItem[];`) thành:

```typescript
  vocabularyMd?: string;
```

- [ ] **Step 2: `useModules.ts` — đổi type, query, mapping**

Trong `src/lib/hooks/useModules.ts`:

Dòng 3, đổi:
```typescript
import { Module, Lesson, Level, VocabularyItem, GrammarExplanation } from "../appTypes";
```
thành:
```typescript
import { Module, Lesson, Level, GrammarExplanation } from "../appTypes";
```

Dòng 17 (trong `SupabaseLesson`), đổi:
```typescript
  vocabulary: unknown;
```
thành:
```typescript
  vocabulary_md: string | null;
```

Dòng 56 (trong `transformModule`), đổi:
```typescript
      vocabulary: (l.vocabulary as VocabularyItem[]) ?? [],
```
thành:
```typescript
      vocabularyMd: l.vocabulary_md ?? undefined,
```

Dòng 101 (chuỗi select supabase), đổi:
```typescript
            next_lesson_id, vocabulary, grammar,
```
thành:
```typescript
            next_lesson_id, vocabulary_md, grammar,
```

- [ ] **Step 3: `mockData.ts` — convert 4 bài học mẫu**

Trong `src/data/mockData.ts`, thay khối `vocabulary: [...]` của từng bài học bằng `vocabularyMd` markdown tương ứng.

Bài `a1-l1` (dòng 26-62), thay:
```typescript
        vocabulary: [
          {
            de: "Guten Tag",
            pronunciation: "['gu:ten ta:k]",
            vi: "Chào ngày mới / Xin chào (ban ngày)",
            exampleDe: "Guten Tag, wie geht es Ihnen?",
            exampleVi: "Xin chào, ngài khỏe không?"
          },
          {
            de: "Wie heißt du?",
            pronunciation: "[vi: haɪst du:]",
            vi: "Bạn tên là gì?",
            exampleDe: "Hallo, ich bin Minh. Wie heißt du?",
            exampleVi: "Chào bạn, mình là Minh. Bạn tên là gì?"
          },
          {
            de: "Ich komme aus...",
            pronunciation: "[ɪç 'kɔmə aʊs]",
            vi: "Tôi đến từ...",
            exampleDe: "Ich komme aus Vietnam.",
            exampleVi: "Tôi đến từ Việt Nam."
          },
          {
            de: "Freut mich",
            pronunciation: "[frɔɪt mɪç]",
            vi: "Rất vui được làm quen",
            exampleDe: "Mein Name ist Thomas. - Freut mich!",
            exampleVi: "Tên tôi là Thomas. - Rất vui được làm quen!"
          },
          {
            de: "Auf Wiedersehen",
            pronunciation: "['aʊf 'vi:dɐ,ze:ən]",
            vi: "Tạm biệt (lịch sự)",
            exampleDe: "Auf Wiedersehen, Frau Schmidt!",
            exampleVi: "Xin tạm biệt bà Schmidt!"
          }
        ],
```
bằng:
```typescript
        vocabularyMd: `### {{Guten Tag}} — Chào ngày mới / Xin chào (ban ngày)
*['gu:ten ta:k]*

🇩🇪 Guten Tag, wie geht es Ihnen?
🇻🇳 Xin chào, ngài khỏe không?

### {{Wie heißt du?}} — Bạn tên là gì?
*[vi: haɪst du:]*

🇩🇪 Hallo, ich bin Minh. Wie heißt du?
🇻🇳 Chào bạn, mình là Minh. Bạn tên là gì?

### {{Ich komme aus...}} — Tôi đến từ...
*[ɪç 'kɔmə aʊs]*

🇩🇪 Ich komme aus Vietnam.
🇻🇳 Tôi đến từ Việt Nam.

### {{Freut mich}} — Rất vui được làm quen
*[frɔɪt mɪç]*

🇩🇪 Mein Name ist Thomas. - Freut mich!
🇻🇳 Tên tôi là Thomas. - Rất vui được làm quen!

### {{Auf Wiedersehen}} — Tạm biệt (lịch sự)
*['aʊf 'vi:dɐ,ze:ən]*

🇩🇪 Auf Wiedersehen, Frau Schmidt!
🇻🇳 Xin tạm biệt bà Schmidt!`,
```

Bài `a1-l2` (dòng 128-157), thay:
```typescript
        vocabulary: [
          {
            de: "die Zahlen",
            pronunciation: "[di: 'tsa:lən]",
            vi: "Các con số / Số đếm",
            exampleDe: "Lernen wir heute die Zahlen von eins bis zehn.",
            exampleVi: "Hôm nay chúng ta cùng học các con số từ một đến mười."
          },
          {
            de: "eins",
            pronunciation: "[aɪns]",
            vi: "số 1",
            exampleDe: "Eins, zwei, drei!",
            exampleVi: "Một, hai, ba!"
          },
          {
            de: "tschüss",
            pronunciation: "[tʃʏs]",
            vi: "Chào tạm biệt (thông dụng, thân mật)",
            exampleDe: "Tschüss, bis morgen!",
            exampleVi: "Tạm biệt nhé, hẹn gặp lại ngày mai!"
          },
          {
            de: "Wie ist Ihre Telefonnummer?",
            pronunciation: "[vi: ɪst 'i:rə tele'fo:n'nʊmɐ]",
            vi: "Số điện thoại của Ngài là gì?",
            exampleDe: "Wie ist Ihre Telefonnummer, Herr Koch?",
            exampleVi: "Số điện thoại của Ngài là gì vậy, ông Koch?"
          }
        ],
```
bằng:
```typescript
        vocabularyMd: `### {{die Zahlen}} — Các con số / Số đếm
*[di: 'tsa:lən]*

🇩🇪 Lernen wir heute die Zahlen von eins bis zehn.
🇻🇳 Hôm nay chúng ta cùng học các con số từ một đến mười.

### {{eins}} — số 1
*[aɪns]*

🇩🇪 Eins, zwei, drei!
🇻🇳 Một, hai, ba!

### {{tschüss}} — Chào tạm biệt (thông dụng, thân mật)
*[tʃʏs]*

🇩🇪 Tschüss, bis morgen!
🇻🇳 Tạm biệt nhé, hẹn gặp lại ngày mai!

### {{Wie ist Ihre Telefonnummer?}} — Số điện thoại của Ngài là gì?
*[vi: ɪst 'i:rə tele'fo:n'nʊmɐ]*

🇩🇪 Wie ist Ihre Telefonnummer, Herr Koch?
🇻🇳 Số điện thoại của Ngài là gì vậy, ông Koch?`,
```

Bài `a2-l1` (dòng 226-255), thay:
```typescript
        vocabulary: [
          {
            de: "der Supermarkt",
            pronunciation: "['zu:pɐ,maːkt]",
            vi: "Siêu thị",
            exampleDe: "Ich gehe in den Supermarkt, um Milch zu kaufen.",
            exampleVi: "Tôi đi vào siêu thị để mua sữa."
          },
          {
            de: "Wie nhiều kostet das?",
            pronunciation: "[vi: vi:l 'kɔstət das]",
            vi: "Cái này giá bao nhiêu?",
            exampleDe: "Entschuldigung, wie viel kostet ein Kilo Äpfel?",
            exampleVi: "Xin lỗi, một ký táo giá bao nhiêu ạ?"
          },
          {
            de: "mit Karte zahlen",
            pronunciation: "[mɪt 'kaʁtə 'tsa:lən]",
            vi: "Thanh toán bằng thẻ",
            exampleDe: "Kann ich mit Karte zahlen?",
            exampleVi: "Tôi có thể thanh toán bằng thẻ được không?"
          },
          {
            de: "die Tüte",
            pronunciation: "['ty:tə]",
            vi: "Túi đựng (túi nilon/túi giấy)",
            exampleDe: "Brauchen Sie eine Tüte?",
            exampleVi: "Bạn có cần một chiếc túi đựng không?"
          }
        ],
```
bằng:
```typescript
        vocabularyMd: `### {{der Supermarkt}} — Siêu thị
*['zu:pɐ,maːkt]*

🇩🇪 Ich gehe in den Supermarkt, um Milch zu kaufen.
🇻🇳 Tôi đi vào siêu thị để mua sữa.

### {{Wie nhiều kostet das?}} — Cái này giá bao nhiêu?
*[vi: vi:l 'kɔstət das]*

🇩🇪 Entschuldigung, wie viel kostet ein Kilo Äpfel?
🇻🇳 Xin lỗi, một ký táo giá bao nhiêu ạ?

### {{mit Karte zahlen}} — Thanh toán bằng thẻ
*[mɪt 'kaʁtə 'tsa:lən]*

🇩🇪 Kann ich mit Karte zahlen?
🇻🇳 Tôi có thể thanh toán bằng thẻ được không?

### {{die Tüte}} — Túi đựng (túi nilon/túi giấy)
*['ty:tə]*

🇩🇪 Brauchen Sie eine Tüte?
🇻🇳 Bạn có cần một chiếc túi đựng không?`,
```

Bài `b1-l1` (dòng 328-357), thay:
```typescript
        vocabulary: [
          {
            de: "Meiner Meinung nach...",
            pronunciation: "['maɪnɐ 'maɪnʊŋ na:x]",
            vi: "Theo quan điểm của tôi thì...",
            exampleDe: "Meiner Meinung nach ist Heimarbeit sehr flexibel.",
            exampleVi: "Theo quan điểm của tôi thì làm việc tại nhà rất linh hoạt."
          },
          {
            de: "Ich stimme dir zu",
            pronunciation: "[ɪç 'ʃtɪmə di:ɐ 'tsu:]",
            vi: "Tôi đồng ý với bạn",
            exampleDe: "Das ist ein guter Punkt. Ich stimme dir zu.",
            exampleVi: "Đó là một ý kiến hay. Tôi đồng ý với bạn."
          },
          {
            de: "einerseits ... andererseits",
            pronunciation: "['aɪnɐ'zaɪts ... 'andəʁə'zaɪts]",
            vi: "Một mặt thì... mặt khác thì...",
            exampleDe: "Einerseits spart man Zeit, andererseits vermisst man Kollegen.",
            exampleVi: "Một mặt ta tiết kiệm thời gian, mặt khác ta lại nhớ đồng nghiệp."
          },
          {
            de: "überzeugen",
            pronunciation: "[y:bɐ'tsɔɪgən]",
            vi: "Thuyết phục",
            exampleDe: "Deine Argumente haben mich überzeugt.",
            exampleVi: "Các luận điểm của bạn đã thuyết phục được tôi."
          }
        ],
```
bằng:
```typescript
        vocabularyMd: `### {{Meiner Meinung nach...}} — Theo quan điểm của tôi thì...
*['maɪnɐ 'maɪnʊŋ na:x]*

🇩🇪 Meiner Meinung nach ist Heimarbeit sehr flexibel.
🇻🇳 Theo quan điểm của tôi thì làm việc tại nhà rất linh hoạt.

### {{Ich stimme dir zu}} — Tôi đồng ý với bạn
*[ɪç 'ʃtɪmə di:ɐ 'tsu:]*

🇩🇪 Das ist ein guter Punkt. Ich stimme dir zu.
🇻🇳 Đó là một ý kiến hay. Tôi đồng ý với bạn.

### {{einerseits ... andererseits}} — Một mặt thì... mặt khác thì...
*['aɪnɐ'zaɪts ... 'andəʁə'zaɪts]*

🇩🇪 Einerseits spart man Zeit, andererseits vermisst man Kollegen.
🇻🇳 Một mặt ta tiết kiệm thời gian, mặt khác ta lại nhớ đồng nghiệp.

### {{überzeugen}} — Thuyết phục
*[y:bɐ'tsɔɪgən]*

🇩🇪 Deine Argumente haben mich überzeugt.
🇻🇳 Các luận điểm của bạn đã thuyết phục được tôi.`,
```

- [ ] **Step 4: `AdminContentSection.tsx` — query, type, defaults**

Trong `src/pages/admin/AdminContentSection.tsx`, dòng 27-29, đổi:
```typescript
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                writing_prompt_md, video_r2_key, order_index, status`;
```
thành:
```typescript
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary_md, grammar, grammar_md, speaking_md,
                writing_prompt_md, video_r2_key, order_index, status`;
```

Dòng 123-128, đổi hàm `emptyVocabGrammar`:
```typescript
  const emptyVocabGrammar = (row: unknown): Pick<AdminLesson, "vocabulary" | "grammar"> => ({
    vocabulary: Array.isArray((row as AdminLesson).vocabulary) ? (row as AdminLesson).vocabulary : [],
    grammar: (row as AdminLesson).grammar && typeof (row as AdminLesson).grammar === "object"
      ? (row as AdminLesson).grammar
      : { title: "", rule: "", examples: [] },
  });
```
thành:
```typescript
  const emptyGrammar = (row: unknown): Pick<AdminLesson, "grammar"> => ({
    grammar: (row as AdminLesson).grammar && typeof (row as AdminLesson).grammar === "object"
      ? (row as AdminLesson).grammar
      : { title: "", rule: "", examples: [] },
  });
```

Dòng 147, trong `handleAddLesson` insert payload, xoá dòng:
```typescript
        vocabulary: [],
```

Dòng 161, đổi:
```typescript
    setEditing({ ...(data as unknown as AdminLesson), ...emptyVocabGrammar(data) });
```
thành:
```typescript
    setEditing({ ...(data as unknown as AdminLesson), ...emptyGrammar(data) });
```

Dòng 229, đổi:
```typescript
                        onEdit={() => setEditing({ ...lesson, ...emptyVocabGrammar(lesson) })}
```
thành:
```typescript
                        onEdit={() => setEditing({ ...lesson, ...emptyGrammar(lesson) })}
```

- [ ] **Step 5: `AdminLessonEditor.tsx` — thay UI edit từng ô bằng markdown editor**

Trong `src/pages/admin/AdminLessonEditor.tsx`, dòng 2-6, đổi import. `Volume2`/`Plus`/`Trash2` chỉ được dùng trong UI vocab cũ (nút loa, nút Thêm, nút Xoá) và `BookOpen` chỉ dùng trong heading "Từ vựng then chốt" cũ — khối JSX mới ở cuối bước này không dùng icon nào trong 4 icon đó, nên cả 4 đều bị bỏ khỏi import:
```typescript
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2,
  Globe, EyeOff,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
```
thành:
```typescript
import {
  ArrowLeft, Save,
  GraduationCap, Video, Loader2,
  Globe, EyeOff,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
```
(dòng import `MarkdownBlock` ngay bên dưới — dòng 9 — giữ nguyên, không đổi; component này đã được import sẵn và dùng cho khối "Ngữ pháp"/"Nói"/"Viết", khối vocabulary mới ở bước này tái sử dụng cùng import đó.)

Dòng 13-19, xoá interface `VocabItem`:
```typescript
interface VocabItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

```

Dòng 34 (trong `LessonEditable`), đổi:
```typescript
  vocabulary: VocabItem[];
```
thành:
```typescript
  vocabulary_md?: string | null;
```

Dòng 68-70 (khai báo state các tab markdown), đổi:
```typescript
  const [grammarTab, setGrammarTab] = useState<"edit" | "preview">("edit");
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
  const [writingTab, setWritingTab] = useState<"edit" | "preview">("edit");
```
thành:
```typescript
  const [grammarTab, setGrammarTab] = useState<"edit" | "preview">("edit");
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
  const [writingTab, setWritingTab] = useState<"edit" | "preview">("edit");
  const [vocabTab, setVocabTab] = useState<"edit" | "preview">("edit");
```

Dòng 75-82, xoá 3 hàm `updVocab`/`addVocab`/`removeVocab`:
```typescript
  const updVocab = (idx: number, patch: Partial<VocabItem>) =>
    setData(prev => { const v = [...prev.vocabulary]; v[idx] = { ...v[idx], ...patch }; return { ...prev, vocabulary: v }; });

  const addVocab = () =>
    setData(prev => ({ ...prev, vocabulary: [{ de: "", pronunciation: "", vi: "", exampleDe: "", exampleVi: "" }, ...prev.vocabulary] }));

  const removeVocab = (idx: number) =>
    setData(prev => ({ ...prev, vocabulary: prev.vocabulary.filter((_, i) => i !== idx) }));

```

Dòng 107 (trong `handleSave`), đổi:
```typescript
      vocabulary: data.vocabulary,
```
thành:
```typescript
      vocabulary_md: data.vocabulary_md || null,
```

Dòng 134 (trong `handlePublish`, cùng nội dung dòng 107), đổi tương tự:
```typescript
      vocabulary: data.vocabulary,
```
thành:
```typescript
      vocabulary_md: data.vocabulary_md || null,
```

Cuối cùng, thay toàn bộ khối JSX "Vocabulary" (dòng 380-429):
```typescript
          {/* Vocabulary */}
          <section className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                </h2>
                <p className="text-[10px] text-slate-400">Click ô để chỉnh sửa trực tiếp</p>
              </div>
              <button onClick={addVocab} className="flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 px-2.5 py-1.5 rounded-xl hover:bg-orange-50 border border-orange-200 transition-colors">
                <Plus className="w-3 h-3" /> Thêm
              </button>
            </div>

            {data.vocabulary.length === 0 && (
              <p className="text-center py-4 text-xs text-slate-400 italic">Chưa có từ vựng.</p>
            )}

            <div className="divide-y divide-slate-100 space-y-0">
              {data.vocabulary.map((vocab, idx) => (
                <div key={idx} className="py-3 first:pt-0 space-y-1.5 group">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 mt-0.5 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                      <Volume2 className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex gap-1.5">
                        <EditableText value={vocab.de} onChange={v => updVocab(idx, { de: v })} className="font-display font-extrabold text-slate-900 text-sm flex-1" placeholder="Tiếng Đức" />
                        <EditableText value={vocab.pronunciation} onChange={v => updVocab(idx, { pronunciation: v })} className="font-mono text-[10px] text-slate-400 w-20" placeholder="[phiên âm]" />
                      </div>
                      <EditableText value={vocab.vi} onChange={v => updVocab(idx, { vi: v })} className="text-xs font-semibold text-slate-700" placeholder="Nghĩa tiếng Việt" />
                      <div className="bg-slate-50/50 rounded-lg p-1.5 border border-slate-100 space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-300">🇩🇪</span>
                          <EditableText value={vocab.exampleDe} onChange={v => updVocab(idx, { exampleDe: v })} className="text-[11px] font-display font-semibold text-slate-700" placeholder="Ví dụ DE" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-300">🇻🇳</span>
                          <EditableText value={vocab.exampleVi} onChange={v => updVocab(idx, { exampleVi: v })} className="text-[11px] italic text-slate-500" placeholder="Dịch VI" />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeVocab(idx)} className="p-1 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
```
bằng khối markdown editor (đúng pattern khối "Nói"/"Viết" phía trên):
```typescript
          {/* Từ vựng — Markdown editor */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Từ vựng then chốt
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setVocabTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${vocabTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {vocabTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown giống ô Nói/Viết. Bọc từ cần luyện phát âm trong <code className="bg-slate-100 text-orange-700 px-1 rounded">{"{{...}}"}</code>, ví dụ <code className="bg-slate-100 text-orange-700 px-1 rounded">{"{{Guten Tag}}"}</code> — học viên click vào sẽ nghe phát âm.</p>
                <textarea
                  rows={12}
                  value={data.vocabulary_md ?? ""}
                  onChange={e => upd({ vocabulary_md: e.target.value })}
                  placeholder={"### {{Guten Tag}} — Chào ngày mới / Xin chào\n*['gu:ten ta:k]*\n\n🇩🇪 Guten Tag, wie geht es Ihnen?\n🇻🇳 Xin chào, ông/bà khoẻ không?"}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.vocabulary_md ? (
                  <MarkdownBlock content={data.vocabulary_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có từ vựng.</p>
                )}
              </div>
            )}
          </div>
```

Ghi chú: khối này đặt đúng vị trí khối "Vocabulary" cũ (trong `<div className="lg:col-span-8 space-y-8">`, sau khối "Viết").

- [ ] **Step 6: `LessonDetailPage.tsx` — tab Wortschatz dùng Markdown**

Trong `src/pages/LessonDetailPage.tsx`, dòng 1-17 (import lucide-react), đổi:
```typescript
import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
  PenLine,
  Loader2,
} from "lucide-react";
```
thành:
```typescript
import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
  PenLine,
  Loader2,
} from "lucide-react";
```

Dòng 20, đổi import `MarkdownBlock`:
```typescript
import { MarkdownBlock } from "../components/MarkdownBlock";
```
thành:
```typescript
import { MarkdownBlock, countHighlightedWords } from "../components/MarkdownBlock";
```

Dòng 65 (`visibleTabs` filter), đổi:
```typescript
    if (id === "tuvung") return lesson.vocabulary.length > 0;
```
thành:
```typescript
    if (id === "tuvung") return !!lesson.vocabularyMd;
```

Thay toàn bộ khối tab Từ vựng (dòng 293-332):
```typescript
          {/* Từ vựng tab */}
          {bottomTab === "tuvung" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                  </h2>
                  <p className="text-[10px] text-slate-400">Click loa để nghe phát âm</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {lesson.vocabulary.length} từ
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {lesson.vocabulary.map((vocab, index) => (
                  <div key={index} className="py-3 first:pt-0 last:pb-0 flex items-start gap-2.5">
                    <button
                      onClick={() => handlePronounce(vocab.de)}
                      className="w-7 h-7 mt-0.5 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-500 flex items-center justify-center transition shrink-0 active:scale-90"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-extrabold text-sm text-slate-900">{vocab.de}</span>
                        <span className="font-mono text-[10px] text-slate-400">{vocab.pronunciation}</span>
                        <span className="text-xs font-semibold text-slate-600 ml-auto">{vocab.vi}</span>
                      </div>
                      <div className="mt-1 bg-slate-50 rounded-lg px-2 py-1.5 text-[10px]">
                        <p className="font-display font-semibold text-slate-700">🇩🇪 {vocab.exampleDe}</p>
                        <p className="text-slate-400 italic mt-0.5">🇻🇳 {vocab.exampleVi}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
```
bằng:
```typescript
          {/* Từ vựng tab */}
          {bottomTab === "tuvung" && lesson.vocabularyMd && (
            <section className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                  </h2>
                  <p className="text-[10px] text-slate-400">Click từ được tô sáng để nghe phát âm</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {countHighlightedWords(lesson.vocabularyMd)} từ
                </span>
              </div>

              <MarkdownBlock content={lesson.vocabularyMd} onWordClick={handlePronounce} />
            </section>
          )}
```

- [ ] **Step 7: `DashboardPage.tsx` — counter từ vựng**

Trong `src/pages/DashboardPage.tsx`, dòng 20, thêm import ngay sau dòng import `DesignSystem`:
```typescript
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
```
thành:
```typescript
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import { countHighlightedWords } from "../components/MarkdownBlock";
```

Dòng 108, đổi:
```typescript
                <span className="flex items-center gap-1">📖 {nextSuggestedLesson.vocabulary.length} từ vựng then chốt</span>
```
thành:
```typescript
                <span className="flex items-center gap-1">📖 {countHighlightedWords(nextSuggestedLesson.vocabularyMd)} từ vựng then chốt</span>
```

- [ ] **Step 8: Type-check toàn bộ**

Run: `npm run lint`
Expected: 0 lỗi (toàn bộ 7 file trên phải cùng compile được — nếu còn lỗi tham chiếu `vocabulary`/`VocabItem`/`VocabularyItem` ở đâu đó, `grep -rn "\.vocabulary\b\|VocabularyItem\|VocabItem" src` để tìm chỗ sót).

- [ ] **Step 9: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts src/data/mockData.ts \
        src/pages/admin/AdminContentSection.tsx src/pages/admin/AdminLessonEditor.tsx \
        src/pages/LessonDetailPage.tsx src/pages/DashboardPage.tsx
git commit -m "$(cat <<'EOF'
feat: replace structured vocabulary with vocabulary_md across app

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tab Hören — bỏ mp3 player khỏi trang bài học

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`
- Delete: `src/components/ListeningClipPlayer.tsx`

**Interfaces:**
- Consumes: không phụ thuộc Task 2/3 về mặt code (độc lập), nhưng nên chạy sau Task 3 để tránh xung đột diff trong cùng file `LessonDetailPage.tsx`.

- [ ] **Step 1: Bỏ import `ListeningClipPlayer`**

Trong `src/pages/LessonDetailPage.tsx`, xoá dòng (nằm ngay sau import `MarkdownBlock`):
```typescript
import { ListeningClipPlayer } from "../components/ListeningClipPlayer";
```

- [ ] **Step 2: Bỏ audio player khỏi tab Hören, thêm đoạn hướng dẫn**

Thay khối tab `nghe` (dòng 248-267 trong file gốc, số dòng có thể lệch nhẹ sau Task 3):
```typescript
          {/* Nghe (Hören) tab — hidden entirely via visibleTabs when
              listeningClips is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "nghe" && lesson.listeningClips.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Headphones className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
              </div>
              <div className="space-y-4">
                {lesson.listeningClips.map((clip, idx) => (
                  <ListeningClipPlayer key={clip.id} lessonId={lesson.id} clip={clip} label={`File ${idx + 1}`} />
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                  Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```
bằng:
```typescript
          {/* Nghe (Hören) tab — hidden entirely via visibleTabs when
              listeningClips is empty, so no "Sắp có" fallback needed. File
              mp3 không phát trực tiếp ở đây — chỉ phát trong QuizPage lúc
              làm bài tập nghe. */}
          {bottomTab === "nghe" && lesson.listeningClips.length > 0 && (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Headphones className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
              </div>
              <h3 className="text-sm font-display font-extrabold text-slate-800">Sẵn sàng luyện nghe chưa?</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                Bấm bắt đầu để nghe file âm thanh và trả lời câu hỏi trắc nghiệm đi kèm.
              </p>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                  Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```

- [ ] **Step 3: Xoá file `ListeningClipPlayer.tsx`**

```bash
rm src/components/ListeningClipPlayer.tsx
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: 0 lỗi. Xác nhận không còn nơi nào import `ListeningClipPlayer`:
```bash
grep -rn "ListeningClipPlayer" src
```
Expected: không có kết quả nào.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git rm src/components/ListeningClipPlayer.tsx
git commit -m "$(cat <<'EOF'
feat: remove mp3 player from lesson page Hören tab, add practice notice

mp3 playback now only happens during the listening exercise (QuizPage),
which already plays clips independently via audioClipId.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tab Lesen — thêm đoạn hướng dẫn

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

- [ ] **Step 1: Thêm đoạn hướng dẫn trước nút "Bắt đầu bài tập đọc"**

Thay khối tab `doc` (dòng 269-291 trong file gốc, số dòng lệch nhẹ sau Task 3/4):
```typescript
          {/* Đọc (Lesen) tab — hidden entirely via visibleTabs when
              readingPassages is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
              </div>
              <div className="space-y-4">
                {lesson.readingPassages.map((passage, idx) => (
                  <div key={passage.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đoạn {idx + 1}</span>
                    <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                  Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```
bằng:
```typescript
          {/* Đọc (Lesen) tab — hidden entirely via visibleTabs when
              readingPassages is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
              </div>
              <div className="space-y-4">
                {lesson.readingPassages.map((passage, idx) => (
                  <div key={passage.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đoạn {idx + 1}</span>
                    <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
                  </div>
                ))}
              </div>
              <div className="text-center space-y-2 pt-1">
                <h3 className="text-sm font-display font-extrabold text-slate-800">Đã đọc kỹ đoạn văn bên trên chưa?</h3>
                <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                  Trả lời câu hỏi trắc nghiệm để kiểm tra khả năng đọc hiểu của bạn.
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                  Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: 0 lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "$(cat <<'EOF'
feat: add reading-comprehension notice to lesson page Lesen tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verification cuối cùng (browser thủ công)

**Files:** không tạo/sửa file mới — chỉ chạy verification theo checklist trong spec.

- [ ] **Step 1: `npm run lint` toàn repo**

Run: `npm run lint`
Expected: 0 lỗi.

- [ ] **Step 2: Chuẩn bị env để chạy dev server trong worktree**

Worktree này không có sẵn `.env.local` (bị gitignore, không copy tự động khi tạo worktree). Copy từ repo gốc:

```bash
cp /Users/thangnv/Documents/web-gemany/.env.local /Users/thangnv/Documents/web-gemany/.claude/worktrees/learning-interface-improvements-c8bf80/.env.local
```

Nếu repo gốc cũng không có `.env.local`, hỏi user lấy `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` từ đâu trước khi tiếp tục — không hardcode key vào code.

- [ ] **Step 3: Chạy dev server**

Dùng `preview_start` với `{name: "dev"}` (cấu hình sẵn trong `.claude/launch.json`, hoặc tạo entry mới trỏ tới `npm run dev` cổng 3000 nếu chưa có) để mở trang trong Browser pane.

- [ ] **Step 4: Kiểm tra tab Wortschatz**

Đăng nhập, mở 1 bài học đã có `vocabulary_md` (backfill ở Task 1) — xác nhận:
- Markdown render đúng (tiêu đề, phiên âm in nghiêng, ví dụ 🇩🇪/🇻🇳).
- Badge góc phải hiện đúng số từ (đếm `{{...}}`).
- Click vào từ được highlight (nền cam nhạt) → nghe phát âm giọng `de-DE` (qua `read_console_messages` xác nhận không có lỗi JS; phát âm thực tế không kiểm tra được qua công cụ text-based, ghi nhận bằng mắt/tai nếu cần).
- Bài học không có `vocabulary_md` → tab Wortschatz ẩn hoàn toàn khỏi thanh tab.

- [ ] **Step 5: Kiểm tra tab Hören**

Mở tab Hören của 1 bài học có `listeningClips` — xác nhận:
- Không còn audio player (`<audio>`) nào hiển thị trực tiếp trong tab.
- Có đoạn "Sẵn sàng luyện nghe chưa?" + mô tả, phía trên nút "Bắt đầu bài tập nghe".
- Bấm "Bắt đầu bài tập nghe" → vào `QuizPage`, nghe được audio bình thường (qua `read_network_requests` xác nhận request tới file audio thành công, hoặc quan sát thẻ `<audio>` xuất hiện với `src` hợp lệ).

- [ ] **Step 6: Kiểm tra tab Lesen**

Mở tab Lesen của 1 bài học có `readingPassages` — xác nhận có đoạn "Đã đọc kỹ đoạn văn bên trên chưa?" + mô tả, phía trên nút "Bắt đầu bài tập đọc".

- [ ] **Step 7: Kiểm tra Admin — soạn từ vựng**

Đăng nhập admin, mở "Quản lý Nội dung" → sửa 1 bài học → khối "Từ vựng then chốt":
- Gõ markdown có `{{...}}`, bấm "Xem trước" → render đúng, từ trong `{{...}}` in đậm màu cam (không có nút click trong preview admin — theo spec, admin preview không cần onWordClick).
- Bấm "Lưu bài học" → quay lại trang học viên, tab Wortschatz hiện đúng nội dung vừa sửa.

- [ ] **Step 8: Kiểm tra Dashboard**

Mở trang Dashboard (học viên có bài học tiếp theo dở dang) — xác nhận số "N từ vựng then chốt" khớp với số `{{...}}` trong `vocabularyMd` của bài học đó.

- [ ] **Step 9: Screenshot xác nhận**

Chụp `computer {action: "screenshot"}` cho tab Wortschatz (thấy từ highlight) và tab Hören (thấy đoạn hướng dẫn, không có audio player) để đính kèm báo cáo hoàn thành.

---
