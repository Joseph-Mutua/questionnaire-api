import { Response, Request } from "express";
import { pool } from "../config/db";
import jwt from "jsonwebtoken";
import { FeedbackIds, Grading, Item, Question, Section } from "../types";
import { Pool } from "pg";

export type AuthRequest = Request & { user?: { userId: string } };

export const createForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
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
      { formId: form_info_result.rows[0].info_id, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );
    const responderUri = `https://example.com/forms/respond?token=${token}`;

    const forms_query =
      "INSERT INTO forms(owner_id, info_id, revision_id, responder_uri, settings_id) VALUES($1, $2, $3, $4, NULL) RETURNING form_id";
    const forms_values = [
      user_id,
      form_info_result.rows[0].info_id,
      revisionId,
      responderUri,
    ];
    const forms_result = await pool.query(forms_query, forms_values);
    const form_id = forms_result.rows[0].form_id;

    if (sections && sections.length > 0) {
      for (const section of sections) {
        await handleSection(pool, form_id, section);
      }
    }
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
  const user_id = req.user?.userId;
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

    await updateOrCreateSettings(pool, settings, form_id);

    // Increment revision ID and update responder URI
    const newRevisionId = `v${
      parseInt(
        (
          await pool.query("SELECT revision_id FROM forms WHERE form_id = $1", [
            form_id,
          ])
        ).rows[0].revision_id.substring(1)
      ) + 1
    }`;
    const newToken = jwt.sign(
      { formId: form_id, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );
    const newResponderUri = `${process.env.APP_DOMAIN_NAME}/forms/respond?token=${newToken}`;

    await pool.query(
      "UPDATE forms SET revision_id = $1, responder_uri = $2 WHERE form_id = $3",
      [newRevisionId, newResponderUri, form_id]
    );

    for (const section of sections) {
      let section_id = await handleSection(pool, form_id, section);

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
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
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
  const user_id = req.user?.userId;
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
    await pool.query("DELETE FROM forms WHERE form_id = $1", [form_id]);
    await pool.query("COMMIT");

    res.json({ message: "Form deleted successfully." });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error deleting form:", error);
    res.status(500).send({ error: "Failed to delete form." });
  }
};

// export const getFormsByUser = async (req: AuthRequest, res: Response) => {
//   const user_id = req.user?.userId;
//   if (!user_id) {
//     return res.status(403).json({ error: "User must be logged in." });
//   }

//   try {
//     const forms = await pool.query(
//       "SELECT form_id, title, description, created_at, updated_at FROM forms f JOIN form_info fi ON f.info_id = fi.info_id WHERE owner_id = $1",
//       [user_id]
//     );

//     res.json(forms.rows);
//   } catch (error) {
//     console.error("Error fetching forms:", error);
//     res.status(500).send({ error: "Failed to fetch forms." });
//   }
// };

export const getFormsByUser = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
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

async function updateOrCreateSettings(
  pool: Pool,
  settings: any,
  form_id: number
) {
  if (settings && settings.hasOwnProperty("is_quiz")) {
    const settingsExist = await pool.query(
      "SELECT settings_id FROM forms WHERE form_id = $1",
      [form_id]
    );
    if (settingsExist.rows.length > 0 && settingsExist.rows[0].settings_id) {
      const updateQuizSettingsQuery =
        "UPDATE quiz_settings SET is_quiz = $1 WHERE quiz_settings_id = (SELECT quiz_settings_id FROM form_settings WHERE settings_id = $2) RETURNING quiz_settings_id";
      await pool.query(updateQuizSettingsQuery, [
        settings.is_quiz,
        settingsExist.rows[0].settings_id,
      ]);
      return settingsExist.rows[0].settings_id;
    } else {
      const quizSettingsResult = await pool.query(
        "INSERT INTO quiz_settings (is_quiz) VALUES ($1) RETURNING quiz_settings_id",
        [settings.is_quiz]
      );
      const formSettingsResult = await pool.query(
        "INSERT INTO form_settings (quiz_settings_id) VALUES ($1) RETURNING settings_id",
        [quizSettingsResult.rows[0].quiz_settings_id]
      );
      await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
        formSettingsResult.rows[0].settings_id,
        form_id,
      ]);
      return formSettingsResult.rows[0].settings_id;
    }
  }
  return null;
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
    const question_id = await handleQuestion(pool, item.question, item_id);
  } else if (item.kind === "question_group_item" && item.questions) {
    for (const question of item.questions) {
      const group_question_id = await handleQuestion(pool, question, item_id);
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
    // Question exists, get the ID
    question_id = existingQuestion.rows[0].question_id;

    // Update existing question details if necessary (e.g., if kind or required status has changed)
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
    let grading_id = await handleGrading(pool, question_id, question.grading);
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
  // Delete existing options (if this is not desirable, further checks need to be implemented)
  await pool.query(`DELETE FROM options WHERE question_id = $1`, [question_id]);

  // Insert new options
  await pool.query(
    `INSERT INTO choice_questions (question_id, type, shuffle) VALUES ($1, $2, $3) ON CONFLICT (question_id) DO UPDATE SET type = EXCLUDED.type, shuffle = EXCLUDED.shuffle`,
    [question_id, question.options?.type, question.options?.shuffle]
  );

  for (const choice of question.options?.choices ?? []) {
    let validatedImageId = await validateImageId(
      pool,
      choice.image_id as number
    ); // Ensures image_id is valid or null
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

async function handleGrading(
  pool: Pool,
  question_id: number,
  grading: Grading
) {
  const feedbackIds = await ensureFeedbackExists(pool, [
    grading.when_right,
    grading.when_wrong,
    grading.general_feedback,
  ]);

  const gradingResult = await pool.query(
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

async function ensureFeedbackExists(pool: Pool, feedbackIds: number[]) {
  let resultIds: FeedbackIds = {
    when_right: null,
    when_wrong: null,
    general_feedback: null,
  };

  for (let i = 0; i < feedbackIds.length; i++) {
    let id = feedbackIds[i];
    if (id) {
      let feedbackCheck = await pool.query(
        `SELECT feedback_id FROM feedbacks WHERE feedback_id = $1`,
        [id]
      );
      if (feedbackCheck.rows.length === 0) {
        // If the feedback does not exist, insert a new one
        let insertFeedback = await pool.query(
          `INSERT INTO feedbacks (text) VALUES ('Default feedback') RETURNING feedback_id`
        );
        id = insertFeedback.rows[0].feedback_id; // use new feedback id
      }
      if (i === 0) resultIds.when_right = id;
      if (i === 1) resultIds.when_wrong = id;
      if (i === 2) resultIds.general_feedback = id;
    }
  }
  return resultIds;
}

async function fetchFormDetails(pool: Pool, form_id: number) {
  const query = `
    SELECT 
        f.form_id, f.revision_id, f.responder_uri, fi.title, fi.description, fs.settings_id, qs.is_quiz,
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
    WHERE f.form_id = $1
    GROUP BY f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz;
  `;
  const details = await pool.query(query, [form_id]);
  return details.rows[0];
}
