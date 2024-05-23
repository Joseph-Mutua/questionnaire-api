-- Users who can create/share forms
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Info: Title and Description of the Form
CREATE TABLE IF NOT EXISTS form_info (
    info_id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT
);

-- Quiz Settings: Settings for Quiz Forms and Grading
CREATE TABLE IF NOT EXISTS quiz_settings (
    quiz_settings_id SERIAL PRIMARY KEY,
    is_quiz BOOLEAN NOT NULL
);

-- Feedback mechanism for quizzes
CREATE TABLE IF NOT EXISTS feedbacks (
    feedback_id SERIAL PRIMARY KEY,
    text TEXT NOT NULL
);

-- Media properties configuration for images and other media in the form
CREATE TABLE IF NOT EXISTS media_properties (
    properties_id SERIAL PRIMARY KEY,
    alignment VARCHAR CHECK (alignment IN ('LEFT', 'RIGHT', 'CENTER')),
    width INTEGER CHECK (width >= 0 AND width <= 740)
);

-- Details about images used in forms
CREATE TABLE IF NOT EXISTS images (
    image_id SERIAL PRIMARY KEY,
    content_uri VARCHAR NOT NULL,  -- A URI from which to download the image
    alt_text VARCHAR, -- image description
    source_uri VARCHAR, -- the URI used to insert the image into the form
    properties_id INTEGER,  -- additional settings for the image, such as alignment and width
    FOREIGN KEY (properties_id) REFERENCES media_properties(properties_id)
);

-- Handles scoring and feedback mechanisms for quiz questions
CREATE TABLE IF NOT EXISTS gradings (
    grading_id SERIAL PRIMARY KEY,
    point_value INTEGER NOT NULL, --Points For a Correct Answer
    when_right INTEGER, --Links to the feedbacks table to fetch the feedback provided when the answer is correct.
    when_wrong INTEGER,
    general_feedback INTEGER, --Links to the feedbacks table to provide general feedback applicable to the question regardless of the respondent's answer being right or wrong
    answer_key TEXT,  -- Store possible correct answers as JSON
    auto_feedback BOOLEAN DEFAULT FALSE,  -- automate feedback provision
    FOREIGN KEY (when_right) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (when_wrong) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (general_feedback) REFERENCES feedbacks(feedback_id)
);

-- Form Settings linking to Quiz Settings
CREATE TABLE IF NOT EXISTS form_settings (
    settings_id SERIAL PRIMARY KEY,
    quiz_settings_id INTEGER,  -- Reference to specific quiz settings if applicable
    update_window_hours INTEGER DEFAULT 24,  -- Time window for updating responses
    wants_email_updates BOOLEAN DEFAULT FALSE,  -- Whether updates should trigger emails
    FOREIGN KEY (quiz_settings_id) REFERENCES quiz_settings(quiz_settings_id)
);

-- Combined Forms and Templates Table
CREATE TABLE IF NOT EXISTS forms (
    form_id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    info_id INTEGER NOT NULL REFERENCES form_info(info_id),
    settings_id INTEGER REFERENCES form_settings(settings_id),
    category_id INTEGER REFERENCES template_categories(category_id), -- Nullable for non-templates
    is_template BOOLEAN DEFAULT FALSE, -- Indicates if the form is a template
    is_public BOOLEAN DEFAULT TRUE, -- Only used for templates
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- roles definition
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL CHECK (name IN ('Owner', 'Editor', 'Viewer', 'SuperAdmin'))
);


INSERT INTO roles (name) VALUES ('Owner'), ('Editor'), ('Viewer'), ('SuperAdmin')
ON CONFLICT (name) DO NOTHING;


CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- User roles in relation to forms
CREATE TABLE IF NOT EXISTS form_user_roles (
  form_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (form_id, user_id),
  FOREIGN KEY (form_id) REFERENCES forms(form_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);


-- Handle form versioning 
CREATE TABLE IF NOT EXISTS form_versions (
    version_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    revision_id VARCHAR NOT NULL DEFAULT 'v1.0',
    content JSONB NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_attribute
        WHERE attrelid = 'forms'::regclass
        AND attname = 'active_version_id'
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
        ALTER TABLE forms ADD COLUMN active_version_id INTEGER;
        ALTER TABLE forms
        ADD CONSTRAINT fk_forms_active_version_id
        FOREIGN KEY (active_version_id) REFERENCES form_versions(version_id);
    END IF; 
END $$;

-- combined sections table(forms/templates)
CREATE TABLE IF NOT EXISTS sections (
    section_id SERIAL PRIMARY KEY,
    form_id INTEGER,
    title VARCHAR NOT NULL,
    description TEXT,
    seq_order INTEGER,
    is_template BOOLEAN DEFAULT FALSE,
    UNIQUE(form_id, seq_order, is_template),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- unique index for form_id and seq_order where is_template is false
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE indexname = 'sections_form_id_seq_order_idx'
    ) THEN
        CREATE UNIQUE INDEX sections_form_id_seq_order_idx
        ON sections (form_id, seq_order)
        WHERE is_template = FALSE;
    END IF;
END $$;

-- unique index for form_id and seq_order where is_template is true
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE indexname = 'sections_template_id_seq_order_idx'
    ) THEN
        CREATE UNIQUE INDEX sections_template_id_seq_order_idx
        ON sections (form_id, seq_order)
        WHERE is_template = TRUE;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS items (
    item_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    section_id INTEGER,
    title VARCHAR,
    description TEXT,
    kind VARCHAR NOT NULL CHECK (kind IN ('question_item', 'question_group_item', 'page_break_item', 'text_item', 'image_item')),
    UNIQUE(form_id, title),  -- 'title' is unique per form
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- --questionItem: Poses a question to the user.
-- --questionGroupItem: Poses one or more questions to the user with a single major prompt.
-- --pageBreakItem: Starts a new page with a title.
-- --textItem: Displays a title and description on the page.
-- --imageItem: Displays an image on the page.

-- Questions of various types that can be part of the form
CREATE TABLE IF NOT EXISTS questions (
    question_id SERIAL PRIMARY KEY,
    required BOOLEAN,
    kind VARCHAR NOT NULL CHECK (kind IN ('choice_question', 'text_question', 'scale_question', 'date_question', 'time_question', 'file_upload_question', 'row_question')),
    grading_id INTEGER,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id)
);

--textQuestion: respondent can enter a free text response. e.g "Please describe your experience with our service."
--scaleQuestion: respondent can choose a number from a range.
--dateQuestion: respondent can choose a date.
--timeQuestion: respondent can choose a time.
--fileUploadQuestion: respondent can upload a file.
--rowQuestion: respondent can enter multiple free text responses. i.e in row/tabular format e.g A budget allocation
--              form where each row specifies a different budget item, and the respondent needs to input amounts or percentages.

-- Links form items to their respective questions, enabling dynamic form structures.

CREATE TABLE IF NOT EXISTS question_items (
    item_id INTEGER,
    question_id INTEGER,
    PRIMARY KEY (item_id, question_id),
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);

-- Specifics for choice-type questions, including options configuration.
CREATE TABLE IF NOT EXISTS choice_questions (
    question_id SERIAL PRIMARY KEY,
    type VARCHAR CHECK (type IN ('RADIO', 'CHECKBOX', 'DROP_DOWN', 'CHOICE_TYPE_UNSPECIFIED')),
    shuffle BOOLEAN, --Whether the options should be displayed in random order for different instances of the quiz. Defaults to false
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Defines options for choice questions, including images and navigation actions.
CREATE TABLE IF NOT EXISTS options (
    option_id SERIAL PRIMARY KEY,
    question_id SERIAL NOT NULL,
    value VARCHAR NOT NULL,
    image_id INTEGER, -- Image for option
    is_other BOOLEAN, -- If option is 'other'
    goto_action VARCHAR CHECK (goto_action IN ('NEXT_SECTION', 'RESTART_FORM', 'SUBMIT_FORM', 'GO_TO_ACTION_UNSPECIFIED')), -- Section navigation type
    goto_section_id SERIAL, -- Section to navigate to if option is selected (RADIO AND SELECT)
    FOREIGN KEY (question_id) REFERENCES choice_questions(question_id),
    FOREIGN KEY (image_id) REFERENCES images(image_id)
);

-- Logs each instance of a form being filled out.
CREATE TABLE IF NOT EXISTS form_responses (
    response_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    version_id INTEGER,
    responder_email VARCHAR(255),  -- To store respondent's email if collected
    response_token VARCHAR UNIQUE,
    create_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_submitted_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_score INTEGER DEFAULT 0,  -- Total score for quiz responses
    FOREIGN KEY (form_id) REFERENCES forms(form_id),
    FOREIGN KEY (version_id) REFERENCES form_versions(version_id)
);

-- Stores answers to specific questions from form submissions
CREATE TABLE IF NOT EXISTS answers (
    answer_id SERIAL PRIMARY KEY,
    response_id INTEGER NOT NULL,
    question_id SERIAL NOT NULL,
    value TEXT,  -- JSON format to store complex answers like choices or uploads
    score INTEGER DEFAULT 0,  -- Score obtained for this answer
    feedback TEXT,  -- Feedback provided for this answer
    FOREIGN KEY (response_id) REFERENCES form_responses(response_id),
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Conditional logic to determine the flow of sections based on answers
CREATE TABLE IF NOT EXISTS navigation_rules (
    rule_id SERIAL PRIMARY KEY,
    section_id SERIAL NOT NULL,
    target_section_id SERIAL NOT NULL,
    condition TEXT,  -- JSON to define conditions based on answers
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (target_section_id) REFERENCES sections(section_id)
);

-- Template Categories for organizing templates
CREATE TABLE IF NOT EXISTS template_categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    description TEXT
);

