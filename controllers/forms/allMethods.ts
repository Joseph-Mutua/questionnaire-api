/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Request, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import {
  fetchFormDetails,
  getSpecificFormResponse,
  handleItem,
  handleSection,
  sendNewResponseAlert,
  sendSubmissionConfirmation,
  updateOrCreateSettings,
} from "../../helpers/forms/formControllerHelpers";

import {
  FormDetailsRequestBody,
  FormResponseBody,
  QuizSettings,
  Section,
} from "../../types";


const router = Router();


// Create Form
router.post("/", authenticateUser, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { title, description } = req.body as {
    title: string;
    description: string;
  };

  if (!user_id) {
    throw new HttpError("User must be logged in.", 403);
  }

  await pool.query("BEGIN");

  const form_info_query =
    "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";

  const form_info_values = [title, description];
  const form_info_result = await pool.query<{ info_id: number }>(
    form_info_query,
    form_info_values
  );

  const revisionId = "v1.0";
  const forms_query =
    "INSERT INTO forms(owner_id, info_id, revision_id) VALUES($1, $2, $3) RETURNING form_id";

  const forms_values = [user_id, form_info_result.rows[0].info_id, revisionId];
  const forms_result = await pool.query<{ form_id: number }>(
    forms_query,
    forms_values
  );

  const form_id = forms_result.rows[0].form_id;
  const initSettingsQuery =
    "INSERT INTO form_settings(quiz_settings_id, update_window_hours, wants_email_updates) VALUES(NULL, 24, FALSE) RETURNING settings_id";
  const settingsResult = await pool.query<{ settings_id: number }>(
    initSettingsQuery
  );
  const settings_id = settingsResult.rows[0].settings_id;
  await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
    settings_id,
    form_id,
  ]);

  // Create the initial version
  const versionResult = await pool.query<{ version_id: number }>(
    "INSERT INTO form_versions(form_id, revision_id, content) VALUES($1, $2, $3) RETURNING version_id",
    [
      forms_result.rows[0].form_id,
      "v1.0",
      JSON.stringify({ title, description }),
    ]
  );

  // Link the active version
  await pool.query(
    "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
    [versionResult.rows[0].version_id, forms_result.rows[0].form_id]
  );

  await pool.query("COMMIT");
  res.status(201).json({
    message: "Form created successfully",
    form_id: form_id,
    form_details: await fetchFormDetails(pool, form_id),
  });
});

//Delete Form
router.delete(
  "/:id",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);

    if (!user_id) {
      throw new HttpError("User must be logged in to delete forms.", 403);
    }
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }

    await pool.query("BEGIN");

    await pool.query(
      "DELETE FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1 )",
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
    await pool.query("DELETE FROM forms WHERE form_id = $1 AND owner_id = $2", [
      form_id,
      user_id,
    ]);
    await pool.query("COMMIT");
    res.json({ message: "Form deleted successfully." });
  }
);

//Fetch all form responses
router.get(
  "/:form_id/responses",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const { form_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError(
        "User must be logged in to access form responses.",
        403
      );
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

    const { rows } = await pool.query<FormDetailsRequestBody>(query, [form_id]);
    if (rows.length > 0) {
      res.json(
        rows.map((row) => ({
          ...row,
          answers: row.answers,
        }))
      );
    } else {
      throw new HttpError("No responses found for this form.", 404);
    }
  }
);

//Form owner route for fetching form
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const form_id = parseInt(req.params.id);
  if (!form_id) {
    throw new HttpError("Invalid form ID provided.", 400);
  }

  const form_details = await fetchFormDetails(pool, form_id);

  if (!form_details) {
    throw new HttpError("Form not found.", 404);
  }

  res.json(form_details);
});

//Public route for accessing form
router.get(
  "/respond",

  async (req: Request, res: Response) => {
    if (!req.query.token) {
      throw new HttpError("Token is required", 400);
    }
    const token = typeof req.query.token === "string" ? req.query.token : null;
    if (!token) {
      throw new HttpError("Token must be a single string", 400);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (
      typeof decoded !== "object" ||
      !decoded.form_id ||
      !decoded.revisionId
    ) {
      throw new HttpError("Invalid token", 400);
    }

    const { form_id, revisionId } = decoded as {
      form_id: number;
      revisionId: string;
    };

    const form_details = await fetchFormDetails(pool, form_id, revisionId);
    if (!form_details) {
      throw new HttpError("Form not found or revision does not match.", 404);
    }

    res.json(form_details);
  }
);

//Get Form response by token
router.get(
  "/:form_id/responses/:responseId/token",

  async (req: Request, res: Response) => {
    const { response_token } = req.query as { response_token: string };

    if (!response_token) {
      throw new HttpError("Unauthorized", 401);
    }
    const decoded = jwt.verify(
      response_token.toString(),
      process.env.JWT_SECRET!
    ) as {
      response_id: number;
      form_id: number;
    };

    const validationResult = await pool.query(
      "SELECT response_id FROM form_responses WHERE response_id = $1 AND form_id = $2 AND response_token = $3",
      [decoded.response_id, decoded.form_id, response_token]
    );
    if (validationResult.rows.length === 0) {
      throw new HttpError("Invalid or expired token", 401);
    }
    await getSpecificFormResponse(req, res);
  }
);

//Submit form response
router.post(
  "/:form_id/responses",

  async (req: Request, res: Response) => {
    const { form_id } = req.params;
    const { answers, respondent_email } = req.body as FormResponseBody;

    await pool.query("BEGIN");

    const insertResponseQuery = `
      INSERT INTO form_responses (form_id, responder_email, create_time, last_submitted_time, total_score)
      VALUES ($1, $2, NOW(), NOW(), 0)
      RETURNING response_id;
    `;

    const responseResult = await pool.query<{ response_id: number }>(
      insertResponseQuery,
      [form_id, respondent_email]
    );
    const response_id = responseResult.rows[0].response_id;

    let total_score = 0;

    for (const [question_id, answer_details] of Object.entries(answers)) {
      const score = answer_details.grade ? answer_details.grade.score : 0;
      const feedback = answer_details.grade
        ? JSON.stringify(answer_details.grade.feedback)
        : null;
      const answer_value = answer_details.text_answers
        ? JSON.stringify(answer_details.text_answers.answers)
        : "{}";

      const insertAnswerQuery = `
        INSERT INTO answers (response_id, question_id, value, score, feedback)
        VALUES ($1, $2, $3, $4, $5);
      `;

      await pool.query(insertAnswerQuery, [
        response_id,
        question_id,
        answer_value,
        score,
        feedback,
      ]);
      total_score += score;
    }

    await pool.query(
      "UPDATE form_responses SET total_score = $1 WHERE response_id = $2",
      [total_score, response_id]
    );
    const response_token = jwt.sign(
      { response_id, form_id },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    if (respondent_email) {
      await sendSubmissionConfirmation(
        respondent_email,
        response_id,
        Number(form_id),
        response_token
      );

      await sendNewResponseAlert(
        Number(form_id),
        response_id,
        respondent_email,
        response_token
      );

      await pool.query(
        "UPDATE form_responses SET response_token = $1 WHERE response_id = $2",
        [response_token, response_id]
      );
    }
    await pool.query("COMMIT");

    res.status(201).json({
      message: "Response submitted successfully",
      response_id: response_id,
    });
  }
);

// Update form
router.patch(
  "/:id",
  authenticateUser,

  async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);
    const { sections, settings } = req.body as {
      sections: Section[];
      settings: QuizSettings;
    };

    const { content } = req.body;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    if (!form_id) {
      throw new HttpError("Invalid form ID.", 400);
    }
    await pool.query("BEGIN");

    const ownerCheckResult = await pool.query<{
      owner_id: number;
      revision_id: string;
    }>("SELECT owner_id, revision_id FROM forms WHERE form_id = $1", [form_id]);

    await updateOrCreateSettings(pool, settings, form_id);

    const currentRevision = ownerCheckResult.rows[0].revision_id;
    const revisionParts = currentRevision.substring(1).split(".");
    let majorVersion = parseInt(revisionParts[0]);
    majorVersion += 1;
    const newRevisionId = `v${majorVersion}.0`;

    await pool.query<{ form_id: number }>(
      "UPDATE forms SET revision_id = $1 WHERE form_id = $2 AND owner_id = $3",
      [newRevisionId, form_id, user_id]
    );

    //version id
    const versionResult = await pool.query<{ version_id: number }>(
      "INSERT INTO form_versions(form_id, revision_id, content) VALUES($1, $2, $3) RETURNING version_id",
      [form_id, newRevisionId, JSON.stringify(content)]
    );

    await pool.query(
      "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
      [versionResult.rows[0].version_id, form_id]
    );

    for (const section of sections) {
      const section_id = await handleSection(pool, form_id, section);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item);
      }
    }

    const form_details = await fetchFormDetails(pool, form_id);

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Form updated successfully",
      form_details: form_details,
    });
  }
);

//Revert form version
router.patch(
  "/:form_id/revert/:version_id",

  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const { form_id, version_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(403).json({ error: "User must be logged in." });
    }

    await pool.query("BEGIN");

    // Validate ownership and check if version belongs to the form
    const validateQuery = `
    SELECT 1 FROM forms
    WHERE form_id = $1 AND owner_id = $2 AND
    EXISTS (SELECT 1 FROM form_versions WHERE form_id = $1 AND version_id = $3);
  `;
    const isValid = await pool.query(validateQuery, [
      form_id,
      user_id,
      version_id,
    ]);

    if (isValid.rowCount !== 1) {
      await pool.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Form or version not found or user is not the owner." });
    }

    // Use CTE to perform all updates in one SQL statement
    const revertVersionQuery = `
    WITH deactivated_versions AS (
      UPDATE form_versions
      SET is_active = FALSE
      WHERE form_id = $1
      RETURNING version_id
    ),
    activated_version AS (
      UPDATE form_versions
      SET is_active = TRUE
      WHERE version_id = $2
      RETURNING version_id
    )
    UPDATE forms
    SET active_version_id = $2
    WHERE form_id = $1;
  `;

    await pool.query(revertVersionQuery, [form_id, version_id]);

    await pool.query("COMMIT");
    res.json({
      message: "Form reverted to the selected version successfully.",
    });
  }
);

export default router;
