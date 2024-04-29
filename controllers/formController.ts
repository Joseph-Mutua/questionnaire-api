import { Response, Request } from "express";
import { pool } from "../config/db";
import jwt from "jsonwebtoken";
import {
  AnswerDetails,
  FeedbackIds,
  Grading,
  Item,
  Question,
  QuizSettings,
  Section,
} from "../types";
import { Pool } from "pg";

import { AuthRequest } from "../middleware/auth";
import { loadEmailTemplate, sendEmail } from "../utils/Mailer";
import { Settings } from "http2";

export const createForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { title, description, sections } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }

  try {
    await pool.query("BEGIN");
    const form_info_query =
      "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";
    const form_info_values = [title, description];
    const form_info_result = await pool.query(
      form_info_query,
      form_info_values
    );

    const revisionId = "v1.0";

    const token = jwt.sign(
      {
        formId: form_info_result.rows[0].info_id,
        permissions: "fill",
        revisionId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );
    const responderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;

    const forms_query =
      "INSERT INTO forms(owner_id, info_id, revision_id, responder_uri) VALUES($1, $2, $3, $4) RETURNING form_id";

    const forms_values = [
      user_id,
      form_info_result.rows[0].info_id,
      revisionId,
      responderUri,
    ];

    const forms_result = await pool.query(forms_query, forms_values);
    const form_id = forms_result.rows[0].form_id;

    const initSettingsQuery =
      "INSERT INTO form_settings(quiz_settings_id, update_window_hours, wants_email_updates) VALUES(NULL, 24, FALSE) RETURNING settings_id";
    const settingsResult = await pool.query(initSettingsQuery);
    const settings_id = settingsResult.rows[0].settings_id;

    await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
      settings_id,
      form_id,
    ]);

    await pool.query("COMMIT");

    res.status(201).json({
      message: "Form created successfully",
      formId: form_id,
      formDetails: await fetchFormDetails(pool, form_id),
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};
export const updateForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const form_id = parseInt(req.params.id);
  const { sections, settings } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }
  if (!form_id) {
    return res.status(400).json({ error: "Invalid form ID." });
  }

  try {
    await pool.query("BEGIN");

    const ownerCheckResult = await pool.query(
      "SELECT owner_id, revision_id FROM forms WHERE form_id = $1",
      [form_id]
    );

    if (ownerCheckResult.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Form not found." });
    }

    if (ownerCheckResult.rows[0].owner_id !== user_id) {
      await pool.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "User is not authorized to update this form." });
    }

    await updateOrCreateSettings(pool, settings, form_id);

    const currentRevision = ownerCheckResult.rows[0].revision_id;
    const revisionParts = currentRevision.substring(1).split(".");
    let majorVersion = parseInt(revisionParts[0]);
    const minorVersion = parseInt(revisionParts[1] || "0");
    majorVersion += 1;
    const newRevisionId = `v${majorVersion}.0`;

    const newToken = jwt.sign(
      { formId: form_id, revisionId: newRevisionId, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );
    const newResponderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${newToken}`;

    await pool.query(
      "UPDATE forms SET revision_id = $1, responder_uri = $2 WHERE form_id = $3",
      [newRevisionId, newResponderUri, form_id]
    );

    if (sections && sections.updateWindowHours !== undefined) {
      // Only update if provided in the request body
      await pool.query(
        "UPDATE forms SET update_window_hours = $1 WHERE form_id = $2",
        [sections.updateWindowHours, form_id]
      );
    }

    for (const section of sections) {
      const section_id = await handleSection(pool, form_id, section);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item);
      }
    }
    const formDetails = await fetchFormDetails(pool, form_id);

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Form updated successfully",
      formDetails: formDetails,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form update:", error);
    res.status(500).send({ error: "Failed to update form." });
  }
};

export const getForm = async (req: AuthRequest, res: Response) => {
  const form_id = parseInt(req.params.id);
  if (!form_id) {
    return res.status(400).json({ error: "Invalid form ID provided." });
  }

  try {
    const formDetails = await fetchFormDetails(pool, form_id);
    if (!formDetails) {
      return res.status(404).json({ error: "Form not found." });
    }
    res.json(formDetails);
  } catch (error) {
    console.error("Error fetching form details:", error);
    res.status(500).send({ error: "Failed to fetch form details." });
  }
};

export const deleteForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const form_id = parseInt(req.params.id);

  if (!user_id) {
    return res
      .status(403)
      .json({ error: "User must be logged in to delete forms." });
  }
  if (!form_id) {
    return res.status(400).json({ error: "Invalid form ID provided." });
  }

  try {
    const ownerCheck = await pool.query(
      "SELECT owner_id FROM forms WHERE form_id = $1",
      [form_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Form not found." });
    }

    if (ownerCheck.rows[0].owner_id !== user_id) {
      return res
        .status(403)
        .json({ error: "User is not authorized to delete this form." });
    }

    await pool.query("BEGIN");

    await pool.query(
      "DELETE FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1)",
      [form_id]
    );
    await pool.query(
      "DELETE FROM questions WHERE question_id IN (SELECT question_id FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1))",
      [form_id]
    );
    await pool.query(
      "DELETE FROM options WHERE question_id IN (SELECT question_id FROM questions WHERE question_id IN (SELECT question_id FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1)))",
      [form_id]
    );
    await pool.query("DELETE FROM items WHERE form_id = $1", [form_id]);
    await pool.query("DELETE FROM sections WHERE form_id = $1", [form_id]);
    await pool.query("DELETE FROM forms WHERE form_id = $1", [form_id]);

    await pool.query("COMMIT");

    res.json({ message: "Form deleted successfully." });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error deleting form:", error);
    res.status(500).send({ error: "Failed to delete form." });
  }
};

export const getFormsByUser = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }

  try {
    const basicFormsQuery = "SELECT form_id FROM forms WHERE owner_id = $1";
    const basicFormsResult = await pool.query(basicFormsQuery, [user_id]);

    if (basicFormsResult.rows.length === 0) {
      return res.status(404).json({ message: "No forms found for this user." });
    }

    const formsDetailsPromises = basicFormsResult.rows.map((row) =>
      fetchFormDetails(pool, row.form_id)
    );
    const formsDetails = await Promise.all(formsDetailsPromises);

    res.json(formsDetails);
  } catch (error) {
    console.error("Error fetching user forms:", error);
    res.status(500).send({ error: "Failed to fetch forms." });
  }
};

export const getFormByToken = async (req: Request, res: Response) => {
  if (!req.query.token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const token = typeof req.query.token === "string" ? req.query.token : null;

  if (!token) {
    return res.status(400).json({ error: "Token must be a single string" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded !== "object" || !decoded.formId || !decoded.revisionId) {
      return res.status(400).json({
        error:
          "Invalid token: Form ID and Revision ID are required in the token payload",
      });
    }

    const { formId, revisionId } = decoded as {
      formId: number;
      revisionId: string;
    };

    const formDetails = await fetchFormDetails(pool, formId, revisionId);
    if (!formDetails) {
      return res
        .status(404)
        .json({ error: "Form not found or revision does not match." });
    }

    res.json(formDetails);
  } catch (error) {
    console.error("Error verifying token or fetching form details:", error);
    return res.status(500).json({ error: "Failed to process request." });
  }
};

export const getSpecificFormResponse = async (req: Request, res: Response) => {
  const { formId, responseId } = req.params;
  try {
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
    const { rows } = await pool.query(query, [formId, responseId]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: "Response not found." });
    }
  } catch (error) {
    console.error("Error fetching form response:", error);
    res.status(500).send({ error: "Failed to fetch form response." });
  }
};
export const getAllFormResponses = async (req: AuthRequest, res: Response) => {
  const { formId } = req.params;
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res
      .status(403)
      .json({ error: "User must be logged in to access form responses." });
  }

  try {
    const ownerCheck = await pool.query(
      "SELECT owner_id FROM forms WHERE form_id = $1",
      [formId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Form not found." });
    }

    if (ownerCheck.rows[0].owner_id !== user_id) {
      return res
        .status(403)
        .json({ error: "User is not authorized to view these responses." });
    }

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
            WHERE r.form_id = $1
            GROUP BY r.response_id
            ORDER BY r.create_time DESC;
        `;
    const { rows } = await pool.query(query, [formId]);
    if (rows.length > 0) {
      res.json(
        rows.map((row) => ({
          ...row,
          answers: row.answers,
        }))
      );
    } else {
      res.status(404).json({ message: "No responses found for this form." });
    }
  } catch (error) {
    console.error("Error listing form responses:", error);
    res.status(500).send({ error: "Failed to list form responses." });
  }
};
export const submitFormResponse = async (req: Request, res: Response) => {
  const { formId } = req.params;
  const { answers, respondentEmail } = req.body;

  try {
    await pool.query("BEGIN");

    const insertResponseQuery = `
            INSERT INTO form_responses (form_id, responder_email, create_time, last_submitted_time, total_score)
            VALUES ($1, $2, NOW(), NOW(), 0)
            RETURNING response_id;
        `;
    const responseResult = await pool.query(insertResponseQuery, [
      formId,
      respondentEmail,
    ]);
    const responseId = responseResult.rows[0].response_id;

    let totalScore = 0;
    for (const [questionId, answerDetails] of Object.entries<AnswerDetails>(
      answers
    )) {
      const score = answerDetails.grade ? answerDetails.grade.score : 0;
      const feedback = answerDetails.grade
        ? JSON.stringify(answerDetails.grade.feedback)
        : null;

      const answerValue = answerDetails.textAnswers
        ? JSON.stringify(answerDetails.textAnswers.answers)
        : "{}";

      const insertAnswerQuery = `
                INSERT INTO answers (response_id, question_id, value, score, feedback)
                VALUES ($1, $2, $3, $4, $5);
            `;
      await pool.query(insertAnswerQuery, [
        responseId,
        questionId,
        answerValue,
        score,
        feedback,
      ]);
      totalScore += score;
    }

    await pool.query(
      "UPDATE form_responses SET total_score = $1 WHERE response_id = $2",
      [totalScore, responseId]
    );

    if (respondentEmail) {
      await sendSubmissionConfirmation(
        respondentEmail,
        responseId,
        Number(formId)
      );
      await sendNewResponseAlert(Number(formId), responseId, respondentEmail);

      // Update form_responses table with response token
      const responseToken = jwt.sign(
        { responseId, formId },
        process.env.JWT_SECRET!,
        { expiresIn: "1d" }
      );
      await pool.query(
        "UPDATE form_responses SET response_token = $1 WHERE response_id = $2",
        [responseToken, responseId]
      );
    }
    await pool.query("COMMIT");
    res.status(201).json({
      message: "Response submitted successfully",
      responseId: responseId,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error submitting form response:", error);
    res.status(500).send({ error: "Failed to submit form response." });
  }
};
async function updateOrCreateSettings(
  pool: Pool,
  settings: QuizSettings,
  form_id: number
) {
  let settingsId = null;

  const settingsExist = await pool.query(
    "SELECT settings_id FROM forms WHERE form_id = $1",
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

    // Update additional settings if provided
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
    // Create new quiz settings if needed
    let quizSettingsId = null;
    if (settings.hasOwnProperty("is_quiz")) {
      const quizSettingsResult = await pool.query(
        "INSERT INTO quiz_settings (is_quiz) VALUES ($1) RETURNING quiz_settings_id",
        [settings.is_quiz]
      );
      quizSettingsId = quizSettingsResult.rows[0].quiz_settings_id;
    }

    const formSettingsResult = await pool.query(
      "INSERT INTO form_settings (quiz_settings_id, update_window_hours, wants_email_updates) VALUES ($1, $2, $3) RETURNING settings_id",
      [
        quizSettingsId,
        settings.update_window_hours || 24,
        settings.wants_email_updates || false,
      ]
    );
    settingsId = formSettingsResult.rows[0].settings_id;

    await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
      settingsId,
      form_id,
    ]);
  }

  return settingsId;
}
async function handleSection(pool: Pool, form_id: number, section: Section) {
  const sectionResult = await pool.query(
    "INSERT INTO sections (form_id, title, description, seq_order) VALUES ($1, $2, $3, $4) ON CONFLICT (form_id, seq_order) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description RETURNING section_id",
    [form_id, section.title, section.description, section.seq_order]
  );
  return sectionResult.rows[0].section_id;
}
async function handleItem(
  pool: Pool,
  form_id: number,
  section_id: number,
  item: Item
) {
  const itemResult = await pool.query(
    `INSERT INTO items (form_id, section_id, title, description, kind) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (form_id, title) DO UPDATE SET
     description = EXCLUDED.description, 
     kind = EXCLUDED.kind, 
     section_id = EXCLUDED.section_id 
     RETURNING item_id`,
    [form_id, section_id, item.title, item.description, item.kind]
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
async function handleQuestion(pool: Pool, question: Question, item_id: number) {
  let question_id;

  const existingQuestion = await pool.query(
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
    const questionResult = await pool.query(
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
async function handleChoiceQuestion(
  pool: Pool,
  question: Question,
  question_id: number
) {
  await pool.query(`DELETE FROM options WHERE question_id = $1`, [question_id]);

  await pool.query(
    `INSERT INTO choice_questions (question_id, type, shuffle) VALUES ($1, $2, $3) ON CONFLICT (question_id) DO UPDATE SET type = EXCLUDED.type, shuffle = EXCLUDED.shuffle`,
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

async function validateImageId(pool: Pool, image_id: number) {
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

interface GradingResult {
  grading_id: number;
}

async function handleGrading(pool: Pool, grading: Grading): Promise<number> {
  const feedbackIds = await ensureFeedbackExists(pool, [
    grading.when_right,
    grading.when_wrong,
    grading.general_feedback,
  ]);

  const gradingResult = await pool.query<GradingResult>(
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

interface feedbackResult {
  feedback_id: number;
}

async function ensureFeedbackExists(pool: Pool, feedbackIds: number[]) {
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
        const insertFeedback = await pool.query<feedbackResult>(
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

async function sendSubmissionConfirmation(
  recipientEmail: string,
  responseId: number,
  formId: number
) {
  const responseLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/${formId}/responses/${responseId}`;

  const confirmationTemplate = loadEmailTemplate(
    "respondentSubmissionConfirmation"
  );

  const emailBody = confirmationTemplate.replace(
    "{{responseLink}}",
    responseLink
  );

  try {
    await sendEmail(recipientEmail, "Form Submission Confirmation", emailBody);
  } catch (error) {
    console.error("Error sending confirmation email.", error);
  }
}

interface settingsResult{
  wants_email_updates: boolean
}
async function sendNewResponseAlert(
  formId: number,
  responseId: number,
  responderEmail: string
) {
  const settingsResult = await pool.query<settingsResult>(
    `SELECT wants_email_updates FROM form_settings WHERE settings_id = (
      SELECT settings_id FROM forms WHERE form_id = $1
    )`,
    [formId]
  );

  if (
    settingsResult.rows.length > 0 &&
    !settingsResult.rows[0].wants_email_updates
  ) {
    console.log(`Email updates are disabled for form ${formId}.`);
    return;
  }

  const ownerEmail = await getFormOwnerEmail(formId);
  if (!ownerEmail) {
    console.error(`Form owner email not found for form ${formId}`);
    return;
  }

  const responseLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/${formId}/responses/${responseId}`;
  const alertTemplate = loadEmailTemplate("ownerNewResponseNotification");

  const submissionDetails = await pool.query(
    "SELECT title FROM form_info WHERE info_id IN (SELECT info_id FROM forms WHERE form_id = $1)",
    [formId]
  );
  const { title } = submissionDetails.rows[0];

  const emailBody = alertTemplate
    .replace("{{formTitle}}", title)
    .replace("{{responderEmail}}", responderEmail)
    .replace("{{responseLink}}", responseLink);

  try {
    await sendEmail(ownerEmail, `New Response for Form "${title}"`, emailBody);
  } catch (error) {
    console.error("Error sending new response alert.", error);
  }
}

async function getFormOwnerEmail(formId: number): Promise<string | null> {
  const result = await pool.query(
    "SELECT email FROM users WHERE user_id = (SELECT owner_id FROM forms WHERE form_id = $1)",
    [formId]
  );
  return result.rows[0]?.email ?? null;
}

export const getViewResponse = async (req: Request, res: Response) => {
 const { responseToken } = req.query as { responseToken: string };

  if (!responseToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    jwt.verify(responseToken.toString(), process.env.JWT_SECRET!);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    await getSpecificFormResponse(req, res);
  } catch (error) {
    console.error("Error fetching form response:", error);
    res.status(500).send({ error: "Failed to fetch form response." });
  }
};

async function fetchFormDetails(
  pool: Pool,
  formId: number,
  revisionId?: string
){
  const revisionCondition = revisionId ? `AND f.revision_id = $2` : "";
  const queryParams: (number | string)[] = [formId];
  if (revisionId) queryParams.push(revisionId);

  const query = `
        SELECT 
            f.form_id, f.revision_id, f.responder_uri, fi.title, fi.description, fs.settings_id, qs.is_quiz,
            fs.quiz_settings_id, fs.update_window_hours, fs.wants_email_updates, 
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
        LEFT JOIN sections s ON f.form_id = s.form_id
        WHERE f.form_id = $1 ${revisionCondition}
        GROUP BY f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz, fs.quiz_settings_id, fs.update_window_hours, fs.wants_email_updates;
    `;
  const details = await pool.query(query, queryParams);
  return details.rows.length ? details.rows[0] : null;
}

//Todo --> Convert to camelCase
//Todo --> Wrap routers and controllers in one block
//Todo --> break up controllers
//Todo --> Postgress naming conventions
//Todo --> Add getViewResponse route for From owners
