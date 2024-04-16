CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- CREATE TABLE IF NOT EXISTS forms (
--     id SERIAL PRIMARY KEY,
--     owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
--     title VARCHAR(255) NOT NULL,
--     description TEXT,
--     created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS sections (
--     id SERIAL PRIMARY KEY,
--     form_id INTEGER REFERENCES forms(id) ON DELETE CASCADE,
--     title VARCHAR(255) NOT NULL,
--     order_index INTEGER,
--     created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS fields (
--     id SERIAL PRIMARY KEY,
--     section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
--     label TEXT NOT NULL,
--     field_type VARCHAR(50) NOT NULL,
--     options TEXT[], 
--     is_required BOOLEAN DEFAULT FALSE,
--     conditional_logic JSONB,
--     order_index INTEGER,
--     created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
-- );


--Schema For Form
CREATE TABLE IF NOT EXISTS forms (
    form_id VARCHAR PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    revision_id VARCHAR NOT NULL,
    responder_uri VARCHAR NOT NULL,
    linked_sheet_id VARCHAR,
    info_id INTEGER NOT NULL,
    settings_id INTEGER NOT NULL,
    FOREIGN KEY (info_id) REFERENCES form_info(info_id),
    FOREIGN KEY (settings_id) REFERENCES form_settings(settings_id)
);


--Schema For Form Info
CREATE TABLE IF NOT EXISTS form_info (
    info_id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    document_title VARCHAR NOT NULL,
    description TEXT
);


--Schema For Form Settings
CREATE TABLE IF NOT EXISTS form_settings (
    settings_id SERIAL PRIMARY KEY,
    quiz_settings_id INTEGER,
    FOREIGN KEY (quiz_settings_id) REFERENCES quiz_settings(quiz_settings_id)
);


--Schema For Quiz Settings
CREATE TABLE IF NOT EXISTS quiz_settings (
    quiz_settings_id SERIAL PRIMARY KEY,
    is_quiz BOOLEAN NOT NULL
);

--Schema For Items
CREATE TABLE IF NOT EXISTS items (
    item_id VARCHAR PRIMARY KEY,
    form_id VARCHAR NOT NULL,
    title VARCHAR,
    description TEXT,
    kind VARCHAR NOT NULL CHECK (kind IN ('questionItem', 'questionGroupItem', 'pageBreakItem', 'textItem', 'imageItem', 'videoItem')),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

--Schema For Items
CREATE TABLE IF NOT EXISTS question_items (
    item_id VARCHAR PRIMARY KEY,
    question_id VARCHAR NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);


--Schema For Questions
CREATE TABLE IF NOT EXISTS questions (
    question_id VARCHAR PRIMARY KEY,
    required BOOLEAN,
    kind VARCHAR NOT NULL CHECK (kind IN ('choiceQuestion', 'textQuestion', 'scaleQuestion', 'dateQuestion', 'timeQuestion', 'fileUploadQuestion', 'rowQuestion')),
    grading_id INTEGER,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id)
);


--Schema for choice questions
CREATE TABLE IF NOT EXISTS choice_questions (
    question_id VARCHAR PRIMARY KEY,
    type VARCHAR CHECK (type IN ('RADIO', 'CHECKBOX', 'DROP_DOWN')),
    shuffle BOOLEAN,
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);


--Schema For Options
CREATE TABLE IF NOT EXISTS options (
    option_id SERIAL PRIMARY KEY,
    question_id VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    image_id INTEGER,
    is_other BOOLEAN,
    goto_action VARCHAR CHECK (goto_action IN ('NEXT_SECTION', 'RESTART_FORM', 'SUBMIT_FORM')),
    goto_section_id VARCHAR,
    FOREIGN KEY (question_id) REFERENCES choice_questions(question_id),
    FOREIGN KEY (image_id) REFERENCES images(image_id)
);


--Schema For Grading
CREATE TABLE IF NOT EXISTS gradings (
    grading_id SERIAL PRIMARY KEY,
    point_value INTEGER NOT NULL,
    when_right INTEGER,
    when_wrong INTEGER,
    general_feedback INTEGER,
    FOREIGN KEY (when_right) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (when_wrong) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (general_feedback) REFERENCES feedbacks(feedback_id)
);


CREATE TABLE IF NOT EXISTS feedbacks (
    feedback_id SERIAL PRIMARY KEY,
    text TEXT NOT NULL
);


--Schema for Feedback and Correct Answers
CREATE TABLE IF NOT EXISTS correct_answers (
    answer_id SERIAL PRIMARY KEY,
    grading_id INTEGER NOT NULL,
    value VARCHAR NOT NULL,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id)
);


-- Schema for Media (Images and Videos)
CREATE TABLE IF NOT EXISTS images (
    image_id SERIAL PRIMARY KEY,
    content_uri VARCHAR NOT NULL,
    alt_text VARCHAR,
    source_uri VARCHAR,
    properties_id INTEGER,
    FOREIGN KEY (properties_id) REFERENCES media_properties(properties_id)
);

CREATE TABLE IF NOT EXISTS videos (
    video_id SERIAL PRIMARY KEY,
    youtube_uri VARCHAR NOT NULL,
    properties_id INTEGER,
    FOREIGN KEY (properties_id) REFERENCES media_properties(properties_id)
);

CREATE TABLE IF NOT EXISTS media_properties (
    properties_id SERIAL PRIMARY KEY,
    alignment VARCHAR CHECK (alignment IN ('LEFT', 'RIGHT', 'CENTER')),
    width INTEGER CHECK (width >= 0 AND width <= 740)
);


--Additional Schemas as Needed for Specifics
CREATE TABLE IF NOT EXISTS grids (
    grid_id SERIAL PRIMARY KEY,
    columns_id INTEGER NOT NULL,
    shuffle_questions BOOLEAN,
    FOREIGN KEY (columns_id) REFERENCES choice_questions(question_id)
);

