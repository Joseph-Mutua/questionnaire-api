import { Pool } from "pg";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  FeedbackIds,
  FormDetails,
  Grading,
  Item,
  Question,
  QuizSettings,
  Section,
} from "../../types";
import { loadEmailTemplate, sendEmail } from "../../utils/Mailer";
import { pool } from "../../config/db";
import HttpError from "../../utils/httpError";

export async function updateOrCreateSettings(
  pool: Pool,
  settings: QuizSettings,
  form_id: number
): Promise<number> {
  let settingsId: number;

  const settingsExist = await pool.query<{ settings_id: number }>(
    `SELECT settings_id FROM forms WHERE form_id = $1`,
    [form_id]
  );

  if (settingsExist.rows.length > 0) {
    settingsId = settingsExist.rows[0].settings_id;

    if (settings.hasOwnProperty("is_quiz")) {
      const updateQuizSettingsQuery = `
        UPDATE quiz_settings
        SET is_quiz = $1
        WHERE quiz_settings_id = (SELECT quiz_settings_id FROM form_settings WHERE settings_id = $2)
        RETURNING quiz_settings_id`;
      await pool.query(updateQuizSettingsQuery, [settings.is_quiz, settingsId]);
    }

    if (
      settings.update_window_hours !== undefined &&
      settings.wants_email_updates !== undefined
    ) {
      const updateSettingsQuery = `
        UPDATE form_settings
        SET update_window_hours = $1, wants_email_updates = $2
        WHERE settings_id = $3`;
      await pool.query(updateSettingsQuery, [
        settings.update_window_hours,
        settings.wants_email_updates,
        settingsId,
      ]);
    }
  } else {
    let quizSettingsId = null;
    if (settings.hasOwnProperty("is_quiz")) {
      const quizSettingsResult = await pool.query<{ quiz_settings_id: number }>(
        "INSERT INTO quiz_settings (is_quiz) VALUES ($1) RETURNING quiz_settings_id",
        [settings.is_quiz]
      );
      quizSettingsId = quizSettingsResult.rows[0].quiz_settings_id;
    }

    const formSettingsResult = await pool.query<{ settings_id: number }>(
      "INSERT INTO form_settings (quiz_settings_id, update_window_hours, wants_email_updates) VALUES ($1, $2, $3) RETURNING settings_id",
      [
        quizSettingsId,
        settings.update_window_hours || 24,
        settings.wants_email_updates || false,
      ]
    );
    settingsId = formSettingsResult.rows[0].settings_id;

    await pool.query(`UPDATE forms SET settings_id = $1 WHERE form_id = $2`, [
      settingsId,
      form_id,
    ]);
  }

  return settingsId;
}
export async function handleSection(
  pool: Pool,
  form_id: number,
  section: Section,
  is_template: boolean
) {
  const sectionResult = await pool.query<{ section_id: number }>(
    `INSERT INTO sections (form_id, title, description, seq_order, is_template) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (form_id, seq_order, is_template) 
     DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description 
     RETURNING section_id`,
    [
      form_id,
      section.title,
      section.description,
      section.seq_order,
      is_template,
    ]
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

  if (item.kind === "question_item" && item.question) {
    await handleQuestion(pool, item.question, item_id);
  } else if (item.kind === "question_group_item" && item.questions) {
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

  if (question.kind === "choice_question" && question.options) {
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
  const feedbackIds = await ensureFeedbackExists(pool, [
    grading.when_right,
    grading.when_wrong,
    grading.general_feedback,
  ]);

  const gradingResult = await pool.query<{
    grading_id: number;
  }>(
    `INSERT INTO gradings (point_value, when_right, when_wrong, general_feedback, answer_key, auto_feedback) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING grading_id`,
    [
      grading.point_value,
      feedbackIds.when_right,
      feedbackIds.when_wrong,
      feedbackIds.general_feedback,
      grading.answer_key,
      grading.auto_feedback,
    ]
  );
  return gradingResult.rows[0].grading_id;
}

export async function ensureFeedbackExists(pool: Pool, feedbackIds: number[]) {
  const resultIds: FeedbackIds = {
    when_right: null,
    when_wrong: null,
    general_feedback: null,
  };

  for (let i = 0; i < feedbackIds.length; i++) {
    let id = feedbackIds[i];
    if (id) {
      const feedbackCheck = await pool.query(
        `SELECT feedback_id FROM feedbacks WHERE feedback_id = $1`,
        [id]
      );
      if (feedbackCheck.rows.length === 0) {
        const insertFeedback = await pool.query<{
          feedback_id: number;
        }>(
          `INSERT INTO feedbacks (text) VALUES ('Default feedback') RETURNING feedback_id`
        );
        id = insertFeedback.rows[0].feedback_id;
      }
      if (i === 0) resultIds.when_right = id;
      if (i === 1) resultIds.when_wrong = id;
      if (i === 2) resultIds.general_feedback = id;
    }
  }

  return resultIds;
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
  }>(
    `SELECT wants_email_updates FROM form_settings WHERE settings_id = (
      SELECT settings_id FROM forms WHERE form_id = $1
    )`,
    [form_id]
  );

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
    "SELECT title FROM form_info WHERE info_id IN (SELECT info_id FROM forms WHERE form_id = $1)",
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
        f.form_id, fi.title, fi.description, 
        json_build_object(
            'is_quiz', COALESCE(qs.is_quiz, false),
            'update_window_hours', COALESCE(fs.update_window_hours, 24),
            'wants_email_updates', COALESCE(fs.wants_email_updates, false)
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
                    'options', (CASE WHEN q.kind = 'choice_question' THEN (
                        SELECT json_agg(json_build_object(
                            'option_id', o.option_id,
                            'value', o.value,
                            'image_id', o.image_id,
                            'is_other', o.is_other,
                            'goto_action', o.goto_action
                        )) FROM options o WHERE o.question_id = q.question_id
                    ) ELSE NULL END)
                )) FROM questions q JOIN question_items qi ON q.question_id = qi.question_id WHERE qi.item_id = i.item_id)
            )) FROM items i WHERE i.section_id = s.section_id)
        )) AS sections
    FROM forms f
    LEFT JOIN form_info fi ON f.info_id = fi.info_id
    LEFT JOIN form_settings fs ON f.settings_id = fs.settings_id
    LEFT JOIN quiz_settings qs ON fs.quiz_settings_id = qs.quiz_settings_id
    LEFT JOIN form_versions fv ON f.form_id = fv.form_id AND fv.version_id = COALESCE($2, f.active_version_id)
    LEFT JOIN sections s ON f.form_id = s.form_id
    WHERE f.form_id = $1
    GROUP BY f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz, fs.update_window_hours, fs.wants_email_updates, fv.revision_id
  `;

  const details = await pool.query<FormDetails>(query, [form_id, version_id]);

  return details.rows.length ? details.rows[0] : null;
}

export const getSpecificFormResponse = async (req: Request, res: Response) => {
  const { form_id, response_id } = req.params;

  const query = `
            SELECT r.response_id, r.form_id, r.responder_email, r.create_time, r.last_submitted_time, r.total_score, 
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
            JOIN roles r ON fur.role_id = r.role_id
            WHERE fur.form_id = $1 AND fur.user_id = $2 AND r.name IN ('Owner', 'Editor')
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
  const currentActiveRevisionId = (
    await pool.query<{ revision_id: string }>(
      "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
      [form_id]
    )
  ).rows[0].revision_id;
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
