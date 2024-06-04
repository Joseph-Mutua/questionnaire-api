-- enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alignment_enum') THEN
        CREATE TYPE alignment_enum AS ENUM ('LEFT', 'RIGHT', 'CENTER');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
        CREATE TYPE user_role_enum AS ENUM ('USER', 'SUPERADMIN');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'form_user_role_enum') THEN
        CREATE TYPE form_user_role_enum AS ENUM ('OWNER', 'EDITOR', 'VIEWER', 'SUPERADMIN');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_kind_enum') THEN
        CREATE TYPE item_kind_enum AS ENUM ('QUESTION_ITEM', 'QUESTION_GROUP_ITEM', 'PAGE_BREAK_ITEM', 'TEXT_ITEM', 'IMAGE_ITEM');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_kind_enum') THEN
        CREATE TYPE question_kind_enum AS ENUM ('CHOICE_QUESTION', 'TEXT_QUESTION', 'SCALE_QUESTION', 'DATE_QUESTION', 'TIME_QUESTION', 'FILE_UPLOAD_QUESTION', 'ROW_QUESTION');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'choice_question_type_enum') THEN
        CREATE TYPE choice_question_type_enum AS ENUM ('RADIO', 'CHECKBOX', 'DROP_DOWN', 'CHOICE_TYPE_UNSPECIFIED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goto_action_enum') THEN
        CREATE TYPE goto_action_enum AS ENUM ('NEXT_SECTION', 'RESTART_FORM', 'SUBMIT_FORM', 'GO_TO_ACTION_UNSPECIFIED');
    END IF;
END $$;

-- Users who can create/share forms/templates
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'USER'
);

-- Details about images used in forms
CREATE TABLE IF NOT EXISTS images (
    image_id SERIAL PRIMARY KEY,
    content_uri TEXT NOT NULL, --download
    alt_text TEXT,
    source_uri TEXT,
    alignment alignment_enum,
    width INTEGER CHECK (width >= 0 AND width <= 740)
);

-- Handles scoring and feedback mechanisms for quiz questions
CREATE TABLE IF NOT EXISTS gradings (
    grading_id SERIAL PRIMARY KEY,
    point_value INTEGER NOT NULL,
    when_right TEXT NOT NULL,
    when_wrong TEXT NOT NULL,
    general_feedback TEXT,
    answer_key TEXT NOT NULL, --possible correct answers
    auto_feedback BOOLEAN DEFAULT FALSE
);

-- Template Categories for organizing templates
CREATE TABLE IF NOT EXISTS template_categories (
    category_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Handle form versioning 
CREATE TABLE IF NOT EXISTS form_versions (
    version_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    revision_id TEXT NOT NULL DEFAULT 'v1.0',
    content JSONB NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Combined Forms and Templates Table
CREATE TABLE IF NOT EXISTS forms (
    form_id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT, 
    is_quiz BOOLEAN DEFAULT FALSE,
    category_id INTEGER REFERENCES template_categories(category_id),
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active_version_id INTEGER,
    update_window_hours INTEGER DEFAULT 0,
    wants_email_updates BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (active_version_id) REFERENCES form_versions(version_id)
);

-- User roles in relation to forms
CREATE TABLE IF NOT EXISTS form_user_roles (
    form_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role form_user_role_enum NOT NULL,
    PRIMARY KEY (form_id, user_id),
    FOREIGN KEY (form_id) REFERENCES forms(form_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Combined sections table(forms/templates)
CREATE TABLE IF NOT EXISTS sections (
    section_id SERIAL PRIMARY KEY,
    form_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    seq_order INTEGER,
    UNIQUE(form_id, seq_order),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- Unique index for form_id and seq_order
CREATE UNIQUE INDEX IF NOT EXISTS sections_form_id_seq_order_idx
ON sections (form_id, seq_order);

CREATE TABLE IF NOT EXISTS items (
    item_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    section_id INTEGER,
    title TEXT,
    description TEXT,
    kind item_kind_enum NOT NULL,
    UNIQUE(form_id, title),
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- Questions of various types that can be part of the form
CREATE TABLE IF NOT EXISTS questions (
    question_id SERIAL PRIMARY KEY,
    required BOOLEAN,
    kind question_kind_enum NOT NULL,
    grading_id INTEGER,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id)
);

-- Links form items to their respective questions, enabling dynamic form structures
CREATE TABLE IF NOT EXISTS question_items (
    item_id INTEGER,
    question_id INTEGER,
    PRIMARY KEY (item_id, question_id),
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);

-- Specifics for choice-type questions, including options configuration
CREATE TABLE IF NOT EXISTS choice_questions (
    question_id SERIAL PRIMARY KEY,
    type choice_question_type_enum,
    shuffle BOOLEAN,
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Defines options for choice questions, including images and navigation actions
CREATE TABLE IF NOT EXISTS options (
    option_id SERIAL PRIMARY KEY,
    question_id SERIAL NOT NULL,
    value TEXT NOT NULL,
    image_id INTEGER,
    is_other BOOLEAN,
    goto_action goto_action_enum,
    goto_section_id SERIAL,
    FOREIGN KEY (question_id) REFERENCES choice_questions(question_id),
    FOREIGN KEY (image_id) REFERENCES images(image_id)
);

-- Logs each instance of a form being filled out
CREATE TABLE IF NOT EXISTS form_responses (
    response_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    version_id INTEGER,
    responder_email VARCHAR(255),
    response_token TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_score INTEGER DEFAULT 0,
    FOREIGN KEY (form_id) REFERENCES forms(form_id),
    FOREIGN KEY (version_id) REFERENCES form_versions(version_id)
);

-- Stores answers to specific questions from form submissions
CREATE TABLE IF NOT EXISTS answers (
    answer_id SERIAL PRIMARY KEY,
    response_id INTEGER NOT NULL,
    question_id SERIAL NOT NULL,
    value TEXT,
    score INTEGER DEFAULT 0,
    feedback TEXT,
    FOREIGN KEY (response_id) REFERENCES form_responses(response_id),
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Conditional logic to determine the flow of sections based on answers
CREATE TABLE IF NOT EXISTS navigation_rules (
    rule_id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL,
    target_section_id INTEGER NOT NULL,
    UNIQUE (section_id, target_section_id, condition),
    condition TEXT,
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (target_section_id) REFERENCES sections(section_id)
);
