/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Request, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import {
  fetchFormDetails,
  getSpecificFormResponse,
  incrementVersion,
  sendNewResponseAlert,
  sendSubmissionConfirmation,
} from "../../helpers/forms/formControllerHelpers";

import {
  FormDetailsRequestBody,
  FormResponseBody,

} from "../../types";
import { inviteUser, isOwner } from "../../helpers/users/userControllerHelpers";
import { io } from "../../server";
import asyncHandler from "../../utils/asyncHandler";
import { createFormOrTemplate } from "../../helpers/createFormOrTemplate";
import { updateFormOrTemplate } from "../../helpers/updateFormOrTemplate";

const router = Router();

// Create Form
router.post(
  "/",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description } = req.body as {
      title: string;
      description: string;
    };

    try {
      const result = await createFormOrTemplate(
        pool,
        user_id!,
        { title, description },
        false
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  })
);

//Delete Form
router.delete(
  "/:id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);

    if (!user_id) {
      throw new HttpError("User must be logged in to delete forms.", 403);
    }
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }
    try {
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
      await pool.query(
        "DELETE FROM forms WHERE form_id = $1 AND owner_id = $2",
        [form_id, user_id]
      );

      await pool.query("COMMIT");
      res.json({ message: "Form deleted successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

//Generate Sharing Link
router.get(
  "/:form_id/share-link",

  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      const result = await pool.query<{ active_version_id: number }>(
        "SELECT active_version_id FROM forms WHERE form_id = $1",
        [form_id]
      );

      if (result.rows.length === 0) {
        throw new HttpError("Form not found.", 404);
      }

      const activeVersionId = result.rows[0].active_version_id;

      if (!activeVersionId) {
        throw new HttpError("Active version not set for this form.", 404);
      }

      const payload = {
        form_id: form_id,
        version_id: activeVersionId,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: "1d",
      });

      await pool.query("COMMIT");
      const sharingLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;

      res.status(200).json({
        message: "Sharing link generated successfully.",
        link: sharingLink,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);


//Fetch all form responses
router.get(
  "/:form_id/responses",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError(
        "User must be logged in to access form responses.",
        403
      );
    }

    try {
      await pool.query("BEGIN");
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
            WHERE r.form_id = $1
            GROUP BY r.response_id
            ORDER BY r.created_at DESC;
        `;

      const { rows } = await pool.query<FormDetailsRequestBody>(query, [
        form_id,
      ]);
      if (rows.length > 0) {
        res.json(
          rows.map((row) => ({
            ...row,
            answers: row.answers,
          }))
        );
        await pool.query("BEGIN");
      } else {
        throw new HttpError("No responses found for this form.", 404);
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

//Form owner route for fetching form
router.get(
  "/:form_id",

  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const form_id = parseInt(req.params.form_id);
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }

    const user_id = req.user?.user_id;
    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");
      const roleCheckQuery = `
    SELECT r.name FROM form_user_roles fur
    JOIN roles r ON fur.role_id = r.role_id
    WHERE fur.form_id = $1 AND fur.user_id = $2;
  `;
      const roleResult = await pool.query<{ name: string }>(roleCheckQuery, [
        form_id,
        user_id,
      ]);

      if (
        roleResult.rowCount === 0 ||
        !roleResult.rows.some((row) =>
          ["Owner", "Editor", "Viewer"].includes(row.name)
        )
      ) {
        throw new HttpError(
          "Unauthorized access. Only owners, editors, or viewers can access the form details.",
          403
        );
      }

      await pool.query("COMMIT");
      const form_details = await fetchFormDetails(pool, form_id);
      if (!form_details) {
        throw new HttpError("Form not found.", 404);
      }
      res.json({ success: true, form: form_details });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

//Public route for accessing form
router.get(
  "/respond",
  asyncHandler(async (req: Request, res: Response) => {
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
      !decoded.version_id
    ) {
      throw new HttpError("Invalid token", 400);
    }

    const { form_id, version_id } = decoded as {
      form_id: number;
      version_id: number;
    };

    const formDetails = await fetchFormDetails(pool, form_id, version_id);

    if (!formDetails) {
      return res.status(404).json({ message: "Form not found" });
    }

    res.status(200).json({
      message: "Form retrieved successfully.",
      form: formDetails,
    });
  })
);


//Get Form response by token
router.get(
  "/:form_id/responses/:responseId/token",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
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

    try {
      await pool.query("BEGIN");
      const validationResult = await pool.query(
        "SELECT response_id FROM form_responses WHERE response_id = $1 AND form_id = $2 AND response_token = $3",
        [decoded.response_id, decoded.form_id, response_token]
      );

      if (validationResult.rows.length === 0) {
        throw new HttpError("Invalid or expired token", 401);
      }
      await getSpecificFormResponse(req, res);

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);


//Get Specific Form Response
router.get(
  "/:form_id/responses/:responseId",

  asyncHandler(authenticateUser),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { form_id, responseId } = req.params;

    try {
      await pool.query("BEGIN");
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
      const { rows } = await pool.query(query, [form_id, responseId]);
      if (rows.length > 0) {
        res.json(rows[0]);
      } else {
        throw new HttpError("Response not found.", 404);
      }

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

// Set Active Version
router.patch(
  "/:form_id/activate_version/:version_id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id, version_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      const currentHighestRevisionResult = await pool.query<{
        revision_id: string;
      }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 ORDER BY revision_id DESC LIMIT 1",
        [form_id]
      );
      const currentHighestRevision =
        currentHighestRevisionResult.rows[0]?.revision_id;

      if (!currentHighestRevision) {
        throw new HttpError("No revisions found for this form.", 404);
      }

      const newRevisionId = incrementVersion(currentHighestRevision);

      await pool.query(
        "UPDATE form_versions SET revision_id = $1 WHERE version_id = $2 AND form_id = $3",
        [newRevisionId, version_id, form_id]
      );

      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
        [form_id]
      );
      await pool.query(
        "UPDATE form_versions SET is_active = TRUE WHERE version_id = $1 AND form_id = $2",
        [version_id, form_id]
      );

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [version_id, form_id]
      );
      await pool.query("COMMIT");

      res.status(200).json({
        message:
          "Active version updated and revision incremented successfully.",
        success: true,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

//Submit form response
router.post(
  "/:form_id/responses",

  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const { answers, respondent_email } = req.body as FormResponseBody;

    try {
      await pool.query("BEGIN");

      const versionQuery = `
        SELECT version_id FROM form_versions
        WHERE form_id = $1 AND is_active = TRUE;
      `;

      const versionResult = await pool.query<{ version_id: number }>(
        versionQuery,
        [form_id]
      );

      const activeVersionId = versionResult.rows[0]?.version_id;

      if (!activeVersionId) {
        res.status(404).json({ error: "Active form version not found." });
        return;
      }

      const insertResponseQuery =`
        INSERT INTO form_responses (form_id, version_id, responder_email, created_at, updated_at, total_score)
        VALUES ($1, $2, $3, NOW(), NOW(), 0)
        RETURNING response_id;
      `;

      const responseResult = await pool.query<{ response_id: number }>(
        insertResponseQuery,
        [form_id, activeVersionId, respondent_email]
      );

      const response_id = responseResult.rows[0].response_id;
      let total_score = 0;

      // Insert answers
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

      await pool.query(
        "UPDATE form_responses SET response_token = $1 WHERE response_id = $2",
        [response_token, response_id]
      );

      // Send notifications
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
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Response submitted successfully",
        response_id: response_id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

// Update form
router.patch(
  "/:id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }
    if (!req.body) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await updateFormOrTemplate(pool, form_id, user_id, req.body, res, next);
  })
);

// DELETE a specific form response by response_id
router.delete(
  "/responses/:response_id",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const { response_id } = req.params;
    const user_id = req.user?.user_id;

    // Optional: Check if the user has the right to delete the response
    const permissionCheckQuery = `
        SELECT r.response_id FROM form_responses r
        JOIN forms f ON f.form_id = r.form_id
        WHERE r.response_id = $1 AND f.owner_id = $2;
      `;
    const permissionResult = await pool.query(permissionCheckQuery, [
      response_id,
      user_id,
    ]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError("Unauthorized to delete this response.", 403);
    }

    await pool.query("BEGIN");

    const deleteAnswersQuery = `
        DELETE FROM answers
        WHERE response_id = $1;
      `;
    await pool.query(deleteAnswersQuery, [response_id]);

    const deleteResponseQuery = `
        DELETE FROM form_responses
        WHERE response_id = $1;
      `;
    await pool.query(deleteResponseQuery, [response_id]);

    await pool.query("COMMIT");
    res.status(200).json({ message: "Response deleted successfully." });
  }
);

// Update form response within a permissible time window
router.patch(
  "/:form_id/responses/:response_id",
  async (req: AuthRequest, res: Response) => {
    const { form_id, response_id } = req.params;
    const { answers } = req.body as FormResponseBody;
    const user_id = req.user?.user_id;

    await pool.query("BEGIN");

    const permissionCheckQuery = `
        SELECT fr.response_id, fr.created_at, fs.update_window_hours
        FROM form_responses fr
        JOIN forms f ON f.form_id = fr.form_id
        JOIN form_settings fs ON fs.settings_id = f.settings_id
        WHERE fr.form_id = $1 AND fr.response_id = $2 AND f.owner_id = $3;
      `;
    const permissionResult = await pool.query<{
      created_at: string;
      update_window_hours: number;
    }>(permissionCheckQuery, [form_id, response_id, user_id]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError(
        "Unauthorized to update this response or response not found.",
        403
      );
    }

    const { created_at, update_window_hours } = permissionResult.rows[0];
    const currentTime = new Date();
    const responseCreateTime = new Date(created_at);
    const expiryTime = new Date(
      responseCreateTime.getTime() + update_window_hours * 3600000
    );

    if (currentTime > expiryTime) {
      throw new HttpError(
        "The time window for updating this response has expired.",
        403
      );
    }

    // Update answers within the response
    for (const [question_id, answer_details] of Object.entries(answers)) {
      const updateAnswerQuery = `
          UPDATE answers
          SET value = $1, score = $2, feedback = $3
          WHERE response_id = $4 AND question_id = $5;
        `;
      const score = answer_details.grade ? answer_details.grade.score : 0;
      const feedback = answer_details.grade
        ? JSON.stringify(answer_details.grade.feedback)
        : null;
      const answer_value = answer_details.text_answers
        ? JSON.stringify(answer_details.text_answers.answers)
        : "{}";

      await pool.query(updateAnswerQuery, [
        answer_value,
        score,
        feedback,
        response_id,
        question_id,
      ]);
    }

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Response updated successfully.",
    });
  }
);

//Invite New User
router.post(
  "/invite",
  authenticateUser,
  isOwner,
  async (req: AuthRequest, res: Response) => {
    const { email, form_id, role_name } = req.body as {
      email: string;
      form_id: number;
      role_name: string;
    };

    await inviteUser(email, form_id, role_name);
    res
      .status(200)
      .send({ message: "Invitation sent successfully.", success: true });
  }
);

export default router;
