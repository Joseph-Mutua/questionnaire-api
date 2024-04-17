
-- Users who can create/share forms
CREATE TABLE IF NOT EXISTS users (
    userId SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

-- Info: Title and Description of the Form
CREATE TABLE IF NOT EXISTS formInfo (
    infoId SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT
);

-- Quiz Settings: Settings for Quiz Forms and Grading
CREATE TABLE IF NOT EXISTS quizSettings (
    quizSettingsId SERIAL PRIMARY KEY,
    isQuiz BOOLEAN NOT NULL
);

-- Feedback mechanism for quizzes
CREATE TABLE IF NOT EXISTS feedbacks (
    feedbackId SERIAL PRIMARY KEY,
    text TEXT NOT NULL
);

-- Handles scoring and feedback mechanisms for quiz questions
CREATE TABLE IF NOT EXISTS gradings (
    gradingId SERIAL PRIMARY KEY,
    pointValue INTEGER NOT NULL,
    whenRight INTEGER,
    whenWrong INTEGER,
    generalFeedback INTEGER,
    answerKey TEXT,  -- store possible correct answers as JSON
    autoFeedback BOOLEAN DEFAULT FALSE,  -- automate feedback provision
    FOREIGN KEY (whenRight) REFERENCES feedbacks(feedbackId),
    FOREIGN KEY (whenWrong) REFERENCES feedbacks(feedbackId),
    FOREIGN KEY (generalFeedback) REFERENCES feedbacks(feedbackId)
);

-- Media properties configuration for images and other media in the form
CREATE TABLE IF NOT EXISTS mediaProperties (
    propertiesId SERIAL PRIMARY KEY,
    alignment VARCHAR CHECK (alignment IN ('LEFT', 'RIGHT', 'CENTER')),
    width INTEGER CHECK (width >= 0 AND width <= 740)
);

-- Details about images used in forms
CREATE TABLE IF NOT EXISTS images (
    imageId SERIAL PRIMARY KEY,
    contentUri VARCHAR NOT NULL,  -- A URI from which to download the image
    altText VARCHAR,  -- image description
    sourceUri VARCHAR,  -- the URI used to insert the image into the form
    propertiesId INTEGER,  -- additional settings for the image, such as alignment and width
    FOREIGN KEY (propertiesId) REFERENCES mediaProperties(propertiesId)
);

-- Form Settings linking to Quiz Settings
CREATE TABLE IF NOT EXISTS formSettings (
    settingsId SERIAL PRIMARY KEY,
    quizSettingsId INTEGER,
    FOREIGN KEY (quizSettingsId) REFERENCES quizSettings(quizSettingsId)
);

-- Core table for forms, linking to settings, owners, and meta-information
CREATE TABLE IF NOT EXISTS forms (
    formId SERIAL PRIMARY KEY,
    ownerId INTEGER REFERENCES users(userId) ON DELETE CASCADE,
    infoId INTEGER NOT NULL,
    revisionId VARCHAR NOT NULL,
    responderUri VARCHAR NOT NULL,
    settingsId INTEGER,
    FOREIGN KEY (infoId) REFERENCES formInfo(infoId),
    FOREIGN KEY (settingsId) REFERENCES formSettings(settingsId),
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sections: manage different sections in the form
CREATE TABLE IF NOT EXISTS sections (
    sectionId SERIAL PRIMARY KEY,
    formId INTEGER NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    seqOrder INTEGER,
    FOREIGN KEY (formId) REFERENCES forms(formId)
);

-- Items: Individual elements (questions, text, images) within the form.
CREATE TABLE IF NOT EXISTS items (
    itemId VARCHAR PRIMARY KEY,
    formId INTEGER NOT NULL,
    title VARCHAR,
    description TEXT,
    kind VARCHAR NOT NULL CHECK (kind IN ('questionItem', 'questionGroupItem', 'pageBreakItem', 'textItem', 'imageItem')),
    FOREIGN KEY (formId) REFERENCES forms(formId)
);


--questionItem: Poses a question to the user.
--questionGroupItem: Poses one or more questions to the user with a single major prompt.
--pageBreakItem: Starts a new page with a title.
--textItem: Displays a title and description on the page.
--imageItem: Displays an image on the page.



-- Questions of various types that can be part of the form
CREATE TABLE IF NOT EXISTS questions (
    questionId VARCHAR PRIMARY KEY,
    required BOOLEAN,
    kind VARCHAR NOT NULL CHECK (kind IN ('choiceQuestion', 'textQuestion', 'scaleQuestion', 'dateQuestion', 'timeQuestion', 'fileUploadQuestion', 'rowQuestion')),
    gradingId INTEGER,
    FOREIGN KEY (gradingId) REFERENCES gradings(gradingId)
);

--textQuestion: respondent can enter a free text response.
--scaleQuestion: respondent can choose a number from a range.
--dateQuestion: respondent can choose a date.
--timeQuestion: respondent can choose a time.
--fileUploadQuestion: respondent can upload a file.
--rowQuestion: respondent can enter multiple free text responses.

-- --TODO: ADD QuestionGroupItems // For a question with multiple Questions Grouped Together

-- --TODO: ADD Image Items
-- Links form items to their respective questions, enabling dynamic form structures.
CREATE TABLE IF NOT EXISTS questionItems (
    itemId VARCHAR PRIMARY KEY,
    questionId VARCHAR NOT NULL,
    FOREIGN KEY (itemId) REFERENCES items(itemId),
    FOREIGN KEY (questionId) REFERENCES questions(questionId)
);

-- Specifics for choice-type questions, including options configuration.
CREATE TABLE IF NOT EXISTS choiceQuestions (
    questionId VARCHAR PRIMARY KEY,
    type VARCHAR CHECK (type IN ('RADIO', 'CHECKBOX', 'DROP_DOWN', 'CHOICE_TYPE_UNSPECIFIED')),
    shuffle BOOLEAN,
    FOREIGN KEY (questionId) REFERENCES questions(questionId)
);

-- Defines options for choice questions, including images and navigation actions.
CREATE TABLE IF NOT EXISTS options (
    optionId SERIAL PRIMARY KEY,
    questionId VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    imageId INTEGER, -- Image for option
    isOther BOOLEAN, -- If option is 'other'
    gotoAction VARCHAR CHECK (gotoAction IN ('NEXT_SECTION', 'RESTART_FORM', 'SUBMIT_FORM', 'GO_TO_ACTION_UNSPECIFIED')), -- Section navigation type
    gotoSectionId VARCHAR, -- Section to navigate to if option is selected (RADIO AND SELECT)
    FOREIGN KEY (questionId) REFERENCES choiceQuestions(questionId),
    FOREIGN KEY (imageId) REFERENCES images(imageId)
);

-- Logs each instance of a form being filled out.
CREATE TABLE IF NOT EXISTS formResponses (
    responseId SERIAL PRIMARY KEY,
    formId INTEGER NOT NULL,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (formId) REFERENCES forms(formId)
);

-- Stores answers to specific questions from form submissions.
CREATE TABLE IF NOT EXISTS answers (
    answerId SERIAL PRIMARY KEY,
    responseId INTEGER NOT NULL,
    questionId VARCHAR NOT NULL,
    value TEXT,  -- store answers as JSON or plain text
    FOREIGN KEY (responseId) REFERENCES formResponses(responseId),
    FOREIGN KEY (questionId) REFERENCES questions(questionId)
);

-- Navigation rules: conditional logic to determine the flow of sections based on answers
CREATE TABLE IF NOT EXISTS navigationRules (
    ruleId SERIAL PRIMARY KEY,
    sectionId SERIAL NOT NULL,
    targetSectionId VARCHAR NOT NULL,
    condition TEXT,  -- JSON to define conditions based on answers
    FOREIGN KEY (sectionId) REFERENCES sections(sectionId),
    FOREIGN KEY (targetSectionId) REFERENCES sections(sectionId)
);
