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

-- Handles scoring and feedback mechanisms for quiz questions
CREATE TABLE IF NOT EXISTS gradings (
    grading_id SERIAL PRIMARY KEY,
    point_value INTEGER NOT NULL,
    when_right INTEGER,
    when_wrong INTEGER,
    general_feedback INTEGER,
    answer_key TEXT,  -- store possible correct answers as JSON
    auto_feedback BOOLEAN DEFAULT FALSE,  -- automate feedback provision
    FOREIGN KEY (when_right) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (when_wrong) REFERENCES feedbacks(feedback_id),
    FOREIGN KEY (general_feedback) REFERENCES feedbacks(feedback_id)
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
    alt_text VARCHAR,  -- image description
    source_uri VARCHAR,  -- the URI used to insert the image into the form
    properties_id INTEGER,  -- additional settings for the image, such as alignment and width
    FOREIGN KEY (properties_id) REFERENCES media_properties(properties_id)
);

-- Form Settings linking to Quiz Settings
CREATE TABLE IF NOT EXISTS form_settings (
    settings_id SERIAL PRIMARY KEY,
    quiz_settings_id INTEGER,
    FOREIGN KEY (quiz_settings_id) REFERENCES quiz_settings(quiz_settings_id)
);

-- Core table for forms, linking to settings, owners, and meta-information
CREATE TABLE IF NOT EXISTS forms (
    form_id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    info_id INTEGER NOT NULL,
    revision_id VARCHAR NOT NULL,
    responder_uri VARCHAR NOT NULL,
    settings_id INTEGER,
    FOREIGN KEY (info_id) REFERENCES form_info(info_id),
    FOREIGN KEY (settings_id) REFERENCES form_settings(settings_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Sections: manage different sections in the form
CREATE TABLE IF NOT EXISTS sections (
    section_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    seq_order INTEGER,
    UNIQUE(form_id, seq_order),  -- Assuming 'seq_order' should be unique per form
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);


CREATE TABLE IF NOT EXISTS items (
    item_id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL,
    section_id INTEGER,
    title VARCHAR,
    description TEXT,
    kind VARCHAR NOT NULL CHECK (kind IN ('question_item', 'question_group_item', 'page_break_item', 'text_item', 'image_item')),
    UNIQUE(form_id, title),  -- Assuming 'title' should be unique per form
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- --questionItem: Poses a question to the user.
-- --questionGroupItem: Poses one or more questions to the user with a single major prompt.
-- --pageBreakItem: Starts a new page with a title.
-- --textItem: Displays a title and description on the page.
-- --imageItem: Displays an image on the page.


 --TODO: ADD QuestionGroupItems // For a question with multiple Questions Grouped Together

--TODO: ADD Image Items

-- Questions of various types that can be part of the form
CREATE TABLE IF NOT EXISTS questions (
    question_id SERIAL PRIMARY KEY,
    required BOOLEAN,
    kind VARCHAR NOT NULL CHECK (kind IN ('choice_question', 'text_question', 'scale_question', 'date_question', 'time_question', 'file_upload_question', 'row_question')),
    grading_id INTEGER,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id)
);


--textQuestion: respondent can enter a free text response.
--scaleQuestion: respondent can choose a number from a range.
--dateQuestion: respondent can choose a date.
--timeQuestion: respondent can choose a time.
--fileUploadQuestion: respondent can upload a file.
--rowQuestion: respondent can enter multiple free text responses.


-- Links form items to their respective questions, enabling dynamic form structures.
CREATE TABLE IF NOT EXISTS question_items (
    item_id SERIAL PRIMARY KEY,
    question_id SERIAL NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Specifics for choice-type questions, including options configuration.
CREATE TABLE IF NOT EXISTS choice_questions (
    question_id SERIAL PRIMARY KEY,
    type VARCHAR CHECK (type IN ('RADIO', 'CHECKBOX', 'DROP_DOWN', 'CHOICE_TYPE_UNSPECIFIED')),
    shuffle BOOLEAN,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES forms(form_id)
);

-- Stores answers to specific questions from form submissions.
CREATE TABLE IF NOT EXISTS answers (
    answer_id SERIAL PRIMARY KEY,
    response_id INTEGER NOT NULL,
    question_id SERIAL NOT NULL,
    value TEXT,  -- store answers as JSON or plain text
    FOREIGN KEY (response_id) REFERENCES form_responses(response_id),
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

-- Navigation rules: conditional logic to determine the flow of sections based on answers
CREATE TABLE IF NOT EXISTS navigation_rules (
    rule_id SERIAL PRIMARY KEY,
    section_id SERIAL NOT NULL,
    target_section_id SERIAL NOT NULL,
    condition TEXT,  -- JSON to define conditions based on answers
    FOREIGN KEY (section_id) REFERENCES sections(section_id),
    FOREIGN KEY (target_section_id) REFERENCES sections(section_id)
);
