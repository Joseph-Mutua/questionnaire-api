import { Pool } from "pg";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  FormDetails,
  Grading,
  Item,
  NavigationRule,
  Question,
  QuestionOptions,
  Section,
} from "../../types";
import { loadEmailTemplate, sendEmail } from "../../utils/Mailer";
import { pool } from "../../config/db";
import HttpError from "../../utils/httpError";

export async function updateOrCreateSettings(
  pool: Pool,
  settings: {
    response_update_window: number;
    wants_email_updates: boolean;
    is_quiz: boolean;
  },
  form_id: number
) {
  await pool.query(
    `UPDATE forms
     SET response_update_window = $1,
         wants_email_updates = $2,
         is_quiz = $3
     WHERE form_id = $4`,
    [
      settings.response_update_window,
      settings.wants_email_updates,
      settings.is_quiz,
      form_id,
    ]
  );
}

export async function updateOrCreateNavigationRule(
  pool: Pool,
  rule: NavigationRule
) {
  await pool.query(
    `INSERT INTO navigation_rules (section_id, target_section_id, condition)
     VALUES ($1, $2, $3)
     ON CONFLICT (section_id, target_section_id, condition) 
     DO UPDATE SET condition = EXCLUDED.condition`,
    [rule.section_id, rule.target_section_id, rule.condition]
  );
}

export async function handleSection(
  pool: Pool,
  form_id: number,
  section: Section
) {
  const sectionResult = await pool.query<{ section_id: number }>(
    `INSERT INTO sections (form_id, title, description, seq_order) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (form_id, seq_order) 
     DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description 
     RETURNING section_id`,
    [form_id, section.title, section.description, section.seq_order]
  );
  return sectionResult.rows[0].section_id;
}

export async function handleItem(
  pool: Pool,
  id: number,
  section_id: number,
  item: Item,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isForm: boolean
) {
  const idField = "form_id";

  const itemResult = await pool.query<{ item_id: number }>(
    `INSERT INTO items (${idField}, section_id, title, description, kind) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (${idField}, title) 
     DO UPDATE SET
     description = EXCLUDED.description, 
     kind = EXCLUDED.kind, 
     section_id = EXCLUDED.section_id 
     RETURNING item_id`,
    [id, section_id, item.title, item.description, item.kind]
  );

  const item_id = itemResult.rows[0].item_id;

  if (item.kind === "QUESTION_ITEM" && item.question) {
    await handleQuestion(pool, item.question, item_id);
  } else if (item.kind === "QUESTION_GROUP_ITEM" && item.questions) {
    for (const question of item.questions) {
      await handleQuestion(pool, question, item_id);
    }
  }
}

export async function handleQuestion(
  pool: Pool,
  question: Question,
  item_id: number
) {
  let question_id;

  const existingQuestion = await pool.query<{ question_id: number }>(
    `SELECT question_id FROM question_items WHERE item_id = $1 AND question_id IN (
      SELECT question_id FROM questions WHERE kind = $2 AND required = $3
    )`,
    [item_id, question.kind, question.required]
  );

  if (existingQuestion.rows.length > 0) {
    question_id = existingQuestion.rows[0].question_id;

    await pool.query(
      `UPDATE questions SET required = $1, kind = $2 WHERE question_id = $3`,
      [question.required, question.kind, question_id]
    );
  } else {
    const questionResult = await pool.query<{ question_id: number }>(
      `INSERT INTO questions (required, kind) VALUES ($1, $2) RETURNING question_id`,
      [question.required, question.kind]
    );
    question_id = questionResult.rows[0].question_id;

    await pool.query(
      `INSERT INTO question_items (item_id, question_id) VALUES ($1, $2)`,
      [item_id, question_id]
    );
  }

  if (question.grading) {
    const grading_id = await handleGrading(pool, question.grading);
    await pool.query(
      `UPDATE questions SET grading_id = $1 WHERE question_id = $2`,
      [grading_id, question_id]
    );
  }

  if (question.kind === "CHOICE_QUESTION" && question.options) {
    await handleChoiceQuestion(pool, question, question_id);
  }

  return question_id;
}

export async function handleChoiceQuestion(
  pool: Pool,
  question: Question,
  question_id: number
) {
  await pool.query(`DELETE FROM options WHERE question_id = $1`, [question_id]);

  await pool.query(
    `INSERT INTO choice_questions (question_id, type, shuffle) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (question_id) 
     DO UPDATE SET type = EXCLUDED.type, shuffle = EXCLUDED.shuffle`,
    [question_id, question.options?.type, question.options?.shuffle]
  );

  for (const choice of question.options?.choices ?? []) {
    const validatedImageId = await validateImageId(
      pool,
      choice.image_id as number
    );
    await pool.query(
      `INSERT INTO options (question_id, value, image_id, is_other, goto_action) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        question_id,
        choice.value,
        validatedImageId,
        choice.is_other,
        choice.goto_action,
      ]
    );
  }
}

export async function validateImageId(pool: Pool, image_id: number) {
  if (image_id === null || image_id === undefined) {
    return null;
  }

  const result = await pool.query(
    `SELECT image_id FROM images WHERE image_id = $1`,
    [image_id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return image_id;
}

export async function handleGrading(
  pool: Pool,
  grading: Grading
): Promise<number> {
  const gradingResult = await pool.query<{ grading_id: number }>(
    `INSERT INTO gradings (point_value, when_right, when_wrong, general_feedback, answer_key, auto_feedback)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING grading_id`,
    [
      grading.point_value,
      grading.when_right,
      grading.when_wrong,
      grading.general_feedback,
      grading.answer_key,
      grading.auto_feedback,
    ]
  );
  return gradingResult.rows[0].grading_id;
}

export async function sendSubmissionConfirmation(
  recipientEmail: string,
  responseId: number,
  form_id: number,
  responseToken: string
) {
  const responseLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/${form_id}/responses/${responseId}/token?response_token=${responseToken}`;

  const confirmationTemplate = loadEmailTemplate(
    "respondentSubmissionConfirmation",
    { responseLink }
  );

  await sendEmail(
    recipientEmail,
    "Form Submission Confirmation",
    confirmationTemplate
  );
}

export async function sendNewResponseAlert(
  form_id: number,
  responseId: number,
  responderEmail: string,
  responseToken: string
) {
  const settingsResult = await pool.query<{
    wants_email_updates: boolean;
  }>(`SELECT wants_email_updates FROM forms WHERE form_id = $1`, [form_id]);

  if (
    settingsResult.rows.length > 0 &&
    !settingsResult.rows[0].wants_email_updates
  ) {
    console.log(`Email updates are disabled for form ${form_id}.`);
    return;
  }

  const ownerEmail = await getFormOwnerEmail(form_id);
  if (!ownerEmail) {
    console.error(`Form owner email not found for form ${form_id}`);
    return;
  }

  const responseLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/${form_id}/responses/${responseId}/token?response_token=${responseToken}`;

  const submissionDetails = await pool.query<{ title: string }>(
    "SELECT title FROM forms WHERE form_id = $1",
    [form_id]
  );
  const { title } = submissionDetails.rows[0];

  const alertTemplate = loadEmailTemplate("ownerNewResponseNotification", {
    formTitle: title,
    responderEmail: responderEmail,
    responseLink: responseLink,
  });

  await sendEmail(
    ownerEmail,
    `New Response for Form "${title}"`,
    alertTemplate
  );
}

export async function getFormOwnerEmail(
  form_id: number
): Promise<string | null> {
  const result = await pool.query<{ email: string }>(
    "SELECT email FROM users WHERE user_id = (SELECT owner_id FROM forms WHERE form_id = $1)",
    [form_id]
  );
  return result.rows[0]?.email ?? null;
}

export async function fetchFormDetails(
  pool: Pool,
  form_id: number,
  version_id?: number
): Promise<FormDetails | null> {
  const query = `
    SELECT 
        f.form_id, f.title, f.description, 
        json_build_object(
            'is_quiz', f.is_quiz,
            'response_update_window', COALESCE(f.response_update_window, 24),
            'wants_email_updates', COALESCE(f.wants_email_updates, false)
        ) as settings,
        fv.revision_id,
        json_agg(json_build_object(
            'section_id', s.section_id, 
            'title', s.title, 
            'description', s.description,
            'seq_order', s.seq_order,
            'items', (SELECT json_agg(json_build_object(
                'item_id', i.item_id, 
                'title', i.title, 
                'description', i.description, 
                'kind', i.kind,
                'questions', (SELECT json_agg(json_build_object(
                    'question_id', q.question_id, 
                    'required', q.required, 
                    'kind', q.kind,
                    'grading', (SELECT json_build_object(
                        'grading_id', g.grading_id,
                        'point_value', g.point_value,
                        'when_right', g.when_right,  
                        'when_wrong', g.when_wrong,  
                        'general_feedback', g.general_feedback,
                        'answer_key', g.answer_key,
                        'auto_feedback', g.auto_feedback
                    ) FROM gradings g WHERE g.grading_id = q.grading_id),
                    'options', (CASE WHEN q.kind = 'CHOICE_QUESTION' THEN (
                        SELECT json_agg(json_build_object(
                            'option_id', o.option_id,
                            'value', o.value,
                            'image', (SELECT json_build_object(
                                'image_id', img.image_id,
                                'content_uri', img.content_uri,
                                'alt_text', img.alt_text,
                                'source_uri', img.source_uri,
                                'alignment', img.alignment,
                                'width', img.width
                            ) FROM images img WHERE img.image_id = o.image_id),
                            'is_other', o.is_other,
                            'goto_action', o.goto_action,
                            'goto_section_id', o.goto_section_id
                        )) FROM options o WHERE o.question_id = q.question_id
                    ) ELSE NULL END)
                )) FROM questions q JOIN question_items qi ON q.question_id = qi.question_id WHERE qi.item_id = i.item_id)
            )) FROM items i WHERE i.section_id = s.section_id)
        )) AS sections,
        (
          SELECT json_agg(json_build_object(
            'rule_id', nr.rule_id,
            'section_id', nr.section_id,
            'target_section_id', nr.target_section_id,
            'condition', nr.condition
          )) FROM navigation_rules nr WHERE nr.section_id IN (SELECT section_id FROM sections WHERE form_id = f.form_id)
        ) AS navigation_rules,
        (
          SELECT json_agg(json_build_object(
            'response_id', fr.response_id,
            'responder_email', fr.responder_email,
            'response_token', fr.response_token,
            'created_at', fr.created_at,
            'updated_at', fr.updated_at,
            'total_score', fr.total_score,
            'answers', (SELECT json_agg(json_build_object(
              'answer_id', a.answer_id,
              'question_id', a.question_id,
              'value', a.value,
              'score', a.score,
              'feedback', a.feedback
            )) FROM answers a WHERE a.response_id = fr.response_id)
          )) FROM form_responses fr WHERE fr.form_id = f.form_id
        ) AS responses
    FROM forms f
    LEFT JOIN form_versions fv ON f.form_id = fv.form_id AND fv.version_id = COALESCE($2, f.active_version_id)
    LEFT JOIN sections s ON f.form_id = s.form_id
    WHERE f.form_id = $1
    GROUP BY f.form_id, f.title, f.description, f.is_quiz, f.response_update_window, f.wants_email_updates, fv.revision_id
  `;

  const details = await pool.query<FormDetails>(query, [form_id, version_id]);

  return details.rows.length ? details.rows[0] : null;
}

// 1. Fetching the Question Details:

// Query the questions table to get details about the question.
// Query the gradings table if grading_id is present in the question.
// Query the options table if the question type is CHOICE_QUESTION.
// Ensure all fetched data is correctly structured and returned.

// 2. Adjustments for Consistency and Correctness:

// Ensure we handle potential cases where there might be no options for choice questions.
// Fix the incorrect access of choiceType which should be retrieved from choice_questions.

export async function fetchQuestionDetails(
  pool: Pool,
  item_id: number
): Promise<Question | undefined> {
  // Fetch question details
  const questionResult = await pool.query<{
    question_id: number;
    required: boolean;
    kind:
      | "CHOICE_QUESTION"
      | "TEXT_QUESTION"
      | "SCALE_QUESTION"
      | "DATE_QUESTION"
      | "TIME_QUESTION"
      | "FILE_UPLOAD_QUESTION"
      | "ROW_QUESTION";
    grading_id: number | null;
  }>(
    `SELECT q.question_id, q.required, q.kind, q.grading_id
     FROM questions q
     JOIN question_items qi ON q.question_id = qi.question_id
     WHERE qi.item_id = $1`,
    [item_id]
  );

  if (questionResult.rowCount === 0) {
    return undefined;
  }

  const question = questionResult.rows[0];

  // Fetch grading details if available
  const gradingResult = question.grading_id
    ? await pool.query<{
        grading_id: number;
        point_value: number;
        when_right: string;
        when_wrong: string;
        general_feedback: string;
        answer_key: string;
        auto_feedback: boolean;
      }>(
        `SELECT grading_id, point_value, when_right, when_wrong, general_feedback, answer_key, auto_feedback
         FROM gradings
         WHERE grading_id = $1`,
        [question.grading_id]
      )
    : undefined;

  // Fetch options if the question is of type CHOICE_QUESTION
  const optionsResult =
    question.kind === "CHOICE_QUESTION"
      ? await pool.query<{
          option_id: number;
          value: string;
          image_id: number | null;
          is_other: boolean;
          goto_action:
            | "NEXT_SECTION"
            | "RESTART_FORM"
            | "SUBMIT_FORM"
            | "GO_TO_ACTION_UNSPECIFIED"
            | null;
          type: "RADIO" | "CHECKBOX" | "DROP_DOWN" | "CHOICE_TYPE_UNSPECIFIED";
          shuffle: boolean;
        }>(
          `SELECT o.option_id, o.value, o.image_id, o.is_other, o.goto_action, cq.type, cq.shuffle
           FROM options o
           JOIN choice_questions cq ON cq.question_id = o.question_id
           WHERE o.question_id = $1`,
          [question.question_id]
        )
      : undefined;

  let options: QuestionOptions | undefined;
  if (optionsResult && optionsResult.rowCount !== null) {
    const choiceQuestion = optionsResult.rows[0];
    options = {
      type: choiceQuestion.type,
      shuffle: choiceQuestion.shuffle,
      choices: optionsResult.rows.map((option) => ({
        option_id: option.option_id,
        value: option.value,
        image_id: option.image_id,
        is_other: option.is_other,
        goto_action: option.goto_action,
      })),
    };
  }

  return {
    ...question,
    grading: gradingResult ? gradingResult.rows[0] : undefined,
    options,
  };
}

export const getSpecificFormResponse = async (req: Request, res: Response) => {
  const { form_id, response_id } = req.params;

  const query = `
            SELECT r.response_id, r.form_id, r.responder_email, r.created_at, r.updated_at, r.total_score, 
                   json_agg(json_build_object(
                       'questionId', a.question_id,
                       'value', a.value,
                       'score', a.score,
                       'feedback', a.feedback
                   )) AS answers
            FROM form_responses r
            JOIN answers a ON r.response_id = a.response_id
            WHERE r.form_id = $1 AND r.response_id = $2
            GROUP BY r.response_id;
        `;
  const { rows } = await pool.query(query, [form_id, response_id]);

  if (rows.length > 0) {
    res.status(200).json(rows[0]);
  } else {
    throw new HttpError("Response not found.", 404);
  }
};

export async function checkAuthorization(
  user_id: number,
  form_id: number
): Promise<boolean> {
  const query = `
        SELECT EXISTS (
            SELECT 1 
            FROM form_user_roles fur
            WHERE fur.form_id = $1 AND fur.user_id = $2 AND fur.role IN ('OWNER', 'EDITOR')
        )
    `;

  const result = await pool.query<{ exists: boolean }>(query, [
    form_id,
    user_id,
  ]);
  return result.rows[0].exists;
}

export async function handleVersionConflict(
  pool: Pool,
  form_id: number,
  old_revision_id: string
): Promise<boolean> {
  const result = await pool.query<{ revision_id: string }>(
    "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
    [form_id]
  );

  if (result.rows.length === 0) {
    throw new HttpError("No active version found for the form.", 404);
  }

  const currentActiveRevisionId = result.rows[0].revision_id;
  return currentActiveRevisionId !== old_revision_id;
}

export const incrementVersion = (currentVersion: string) => {
  const versionParts = currentVersion.substring(1).split(".");
  let major = parseInt(versionParts[0]);
  let minor = parseInt(versionParts[1]);

  minor += 1;
  if (minor >= 10) {
    major += 1;
    minor = 0;
  }

  return `v${major}.${minor}`;
};

export const generateToken = (user_id: string) => {
  return jwt.sign({ user_id }, process.env.JWT_SECRET!, { expiresIn: "24h" });
};
