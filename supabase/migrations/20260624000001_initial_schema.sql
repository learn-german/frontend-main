-- =============================================================================
-- DeutschPath — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT        NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  is_premium  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- user_stats
-- ---------------------------------------------------------------------------
CREATE TABLE user_stats (
  user_id            UUID    REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  xp                 INTEGER NOT NULL DEFAULT 0,
  streak             INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------
CREATE TABLE modules (
  id          TEXT    PRIMARY KEY,
  level       TEXT    NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2')),
  title       TEXT    NOT NULL,
  title_vi    TEXT    NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- lessons
-- vocabulary  JSONB: [{de, pronunciation, vi, exampleDe, exampleVi}]
-- grammar     JSONB: {title, rule, examples:[{de, vi}]}
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id             TEXT    PRIMARY KEY,
  module_id      TEXT    REFERENCES modules(id) ON DELETE CASCADE,
  level          TEXT    NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2')),
  title          TEXT    NOT NULL,
  title_vi       TEXT    NOT NULL,
  objective      TEXT,
  summary        TEXT,
  youtube_id     TEXT,
  duration       TEXT,                    -- "05:40" format
  order_index    INTEGER NOT NULL DEFAULT 0,
  xp_reward      INTEGER NOT NULL DEFAULT 15,
  next_lesson_id TEXT    REFERENCES lessons(id),
  vocabulary     JSONB   NOT NULL DEFAULT '[]',
  grammar        JSONB   NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- quiz_questions  (correct_answer never exposed to client via PostgREST)
-- options         JSONB: ["A","B","C","D"]      (multiple-choice / listening)
-- matching_pairs  JSONB: [{"de":"...","vi":"..."}]
-- ---------------------------------------------------------------------------
CREATE TABLE quiz_questions (
  id             UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id      TEXT    REFERENCES lessons(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL CHECK (type IN ('multiple-choice', 'fill-blank', 'matching', 'listening')),
  question_text  TEXT    NOT NULL,
  audio_text     TEXT,
  options        JSONB,
  matching_pairs JSONB,
  correct_answer TEXT    NOT NULL,
  explanation    TEXT    NOT NULL DEFAULT '',
  order_index    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- quiz_questions_public  — view that hides correct_answer
-- Frontend reads from this view; Edge Function reads from base table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    question_text,
    audio_text,
    options,
    matching_pairs,
    explanation,
    order_index
  FROM quiz_questions;

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_progress (
  user_id      UUID        REFERENCES profiles(id)  ON DELETE CASCADE,
  lesson_id    TEXT        REFERENCES lessons(id)   ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quiz_score   INTEGER,
  PRIMARY KEY (user_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile + user_stats on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  );

  INSERT INTO user_stats (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- profiles: user chỉ đọc/sửa profile của chính mình
CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- user_stats: user chỉ đọc/sửa stats của chính mình
CREATE POLICY "user_stats: own read"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_stats: own update"
  ON user_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- modules: tất cả user đã đăng nhập đều đọc được
CREATE POLICY "modules: authenticated read"
  ON modules FOR SELECT
  TO authenticated
  USING (true);

-- lessons: tất cả user đã đăng nhập đều đọc được
CREATE POLICY "lessons: authenticated read"
  ON lessons FOR SELECT
  TO authenticated
  USING (true);

-- quiz_questions: KHÔNG expose trực tiếp — frontend dùng view quiz_questions_public
-- Admin (service_role) đọc/ghi qua Edge Function
-- Không tạo SELECT policy ở đây để anon/authenticated không thể đọc correct_answer

-- lesson_progress: user chỉ đọc/ghi progress của chính mình
CREATE POLICY "lesson_progress: own read"
  ON lesson_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "lesson_progress: own insert"
  ON lesson_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lesson_progress: own update"
  ON lesson_progress FOR UPDATE
  USING (auth.uid() = user_id);
