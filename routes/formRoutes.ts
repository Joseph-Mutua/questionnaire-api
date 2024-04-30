/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import { AuthRequest, authenticateUser } from "../middleware/auth";
import { getSpecificFormResponse } from "../helpers/forms/formControllerHelpers";
import HttpError from "../utils/httpError";
import { pool } from "../config/db";
import jwt from "jsonwebtoken";
import {
  fetchFormDetails,
  handleItem,
  handleSection,
  sendNewResponseAlert,
  sendSubmissionConfirmation,
  updateOrCreateSettings,
} from "../helpers/forms/formControllerHelpers";
import { FormDetailsRequestBody, QuizSettings, Section } from "../types";
import asyncErrorHandler from "../middleware/asyncErrorHandler";

const router = Router();

// Routes for form management
router.post(
  "/",
  authenticateUser,

  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
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
    await pool.query("COMMIT");
    res.status(201).json({
      message: "Form created successfully",
      formId: form_id,
      formDetails: await fetchFormDetails(pool, form_id),
    });
  })
);

//Public route for accessing form
router.get(
  "/respond",

  asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.query.token) {
      throw new HttpError("Token is required", 400);
    }

    const token = typeof req.query.token === "string" ? req.query.token : null;

    if (!token) {
      throw new HttpError("Token must be a single string", 400);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded !== "object" || !decoded.formId || !decoded.revisionId) {
      throw new HttpError("Invalid token", 400);
    }

    const { formId, revisionId } = decoded as {
      formId: number;
      revisionId: string;
    };

    const formDetails = await fetchFormDetails(pool, formId, revisionId);
    if (!formDetails) {
      throw new HttpError("Form not found or revision does not match.", 404);
    }

    res.json(formDetails);
  })
);

router.get(
  "/:id",
  authenticateUser,

  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
    const form_id = parseInt(req.params.id);
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }

    const formDetails = await fetchFormDetails(pool, form_id);
    if (!formDetails) {
      throw new HttpError("Form not found.", 404);
    }
    res.json(formDetails);
  })
);

router.patch(
  "/:id",
  authenticateUser,
  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);
    const { sections, settings } = req.body as {
      sections: Section[];
      settings: QuizSettings;
    };

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

    if (ownerCheckResult.rows.length === 0) {
      await pool.query("ROLLBACK");
      throw new HttpError("Form not found.", 404);
    }

    if (ownerCheckResult.rows[0].owner_id !== user_id) {
      await pool.query("ROLLBACK");
      throw new HttpError("User is not authorized to update this form.", 403);
    }

    await updateOrCreateSettings(pool, settings, form_id);

    const currentRevision = ownerCheckResult.rows[0].revision_id;
    const revisionParts = currentRevision.substring(1).split(".");
    let majorVersion = parseInt(revisionParts[0]);
    majorVersion += 1;
    const newRevisionId = `v${majorVersion}.0`;

    const newToken = jwt.sign(
      { formId: form_id, revisionId: newRevisionId, permissions: "fill" },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );
    const newResponderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${newToken}`;

    await pool.query<{ form_id: number }>(
      "UPDATE forms SET revision_id = $1, responder_uri = $2 WHERE form_id = $3",
      [newRevisionId, newResponderUri, form_id]
    );

    if (settings && settings.update_window_hours !== undefined) {
      await pool.query(
        "UPDATE forms SET update_window_hours = $1 WHERE form_id = $2",
        [settings.update_window_hours, form_id]
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
  })
);

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

    const ownerCheck = await pool.query<{ owner_id: number }>(
      "SELECT owner_id FROM forms WHERE form_id = $1",
      [form_id]
    );

    if (ownerCheck.rows.length === 0) {
      throw new HttpError("Form not found.", 404);
    }

    if (ownerCheck.rows[0].owner_id !== user_id) {
      throw new HttpError("User is not authorized to delete this form.", 403);
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
  }
);

router.get(
  "/:formId/responses",
  authenticateUser,

  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
    const { formId } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError(
        "User must be logged in to access form responses.",
        403
      );
    }

    const ownerCheck = await pool.query<{ owner_id: number }>(
      "SELECT owner_id FROM forms WHERE form_id = $1",
      [formId]
    );

    if (ownerCheck.rows.length === 0) {
      throw new HttpError("Form not found.", 404);
    }

    if (ownerCheck.rows[0].owner_id !== user_id) {
      throw new HttpError(
        "User is not authorized to view these responses.",
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
    const { rows } = await pool.query<FormDetailsRequestBody>(query, [formId]);
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
  })
);

//Submit form response
router.post(
  "/:formId/responses",

  asyncErrorHandler(async (req: Request, res: Response) => {
    const { formId } = req.params;
    const { answers, respondentEmail } = req.body as FormDetailsRequestBody;

    await pool.query("BEGIN");

    const insertResponseQuery = `
      INSERT INTO form_responses (form_id, responder_email, create_time, last_submitted_time, total_score)
      VALUES ($1, $2, NOW(), NOW(), 0)
      RETURNING response_id;
    `;
    const responseResult = await pool.query<{ response_id: number }>(
      insertResponseQuery,
      [formId, respondentEmail]
    );
    const responseId = responseResult.rows[0].response_id;

    let totalScore = 0;

    for (const [questionId, answerDetails] of Object.entries(answers)) {
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
    const responseToken = jwt.sign(
      { responseId, formId },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    if (respondentEmail) {
      await sendSubmissionConfirmation(
        respondentEmail,
        responseId,
        Number(formId),
        responseToken
      );
      await sendNewResponseAlert(
        Number(formId),
        responseId,
        respondentEmail,
        responseToken
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
  })
);

//Get response by token
router.get(
  "/:formId/responses/:responseId/token",

  asyncErrorHandler(async (req: Request, res: Response) => {
    const { responseToken } = req.query as { responseToken: string };

    if (!responseToken) {
      throw new HttpError("Unauthorized", 401);
    }
    const decoded = jwt.verify(
      responseToken.toString(),
      process.env.JWT_SECRET!
    ) as {
      responseId: number;
      formId: number;
    };

    const validationResult = await pool.query(
      "SELECT response_id FROM form_responses WHERE response_id = $1 AND form_id = $2 AND response_token = $3",
      [decoded.responseId, decoded.formId, responseToken]
    );
    if (validationResult.rows.length === 0) {
      throw new HttpError("Invalid or expired token", 401);
    }
    await getSpecificFormResponse(req, res);
  })
);

//Get Specific Form Response
router.get(
  "/:formId/responses/:responseId",
  authenticateUser,
  asyncErrorHandler(async (req: Request, res: Response) => {
    const { formId, responseId } = req.params;

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
      throw new HttpError("Response not found.", 404);
    }
  })
);

export default router;
