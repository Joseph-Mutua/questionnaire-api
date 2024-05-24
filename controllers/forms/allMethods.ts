/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Request, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import {
  fetchFormDetails,
  getSpecificFormResponse,
  handleItem,
  handleSection,
  handleVersionConflict,
  incrementVersion,
  updateOrCreateSettings,
} from "../../helpers/forms/formControllerHelpers";

import {
  FormDetailsRequestBody,
  FormResponseBody,
  QuizSettings,
  Section,
} from "../../types";
import { inviteUser, isOwner } from "../../helpers/users/userControllerHelpers";
import { io } from "../../server";

const router = Router();

//Forms
// Create Form
router.post(
  "/",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description } = req.body as {
      title: string;
      description: string;
    };

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      const infoResult = await pool.query<{ info_id: number }>(
        "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id",
        [title, description]
      );
      const info_id = infoResult.rows[0].info_id;

      const formResult = await pool.query<{ form_id: number }>(
        "INSERT INTO forms(owner_id, info_id) VALUES($1, $2) RETURNING form_id",
        [user_id, info_id]
      );
      const form_id = formResult.rows[0].form_id;

      const roleIdResult = await pool.query<{ role_id: number }>(
        "SELECT role_id FROM roles WHERE name = 'Owner'"
      );
      const ownerRoleId = roleIdResult.rows[0].role_id;

      await pool.query(
        "INSERT INTO form_user_roles(form_id, user_id, role_id) VALUES ($1, $2, $3)",
        [form_id, user_id, ownerRoleId]
      );

      const versionResult = await pool.query<{ version_id: number }>(
        "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, 'v1.0', $2::jsonb, TRUE) RETURNING version_id",
        [form_id, req.body]
      );
      const version_id = versionResult.rows[0].version_id;

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [version_id, form_id]
      );

      await pool.query("COMMIT");

      const formDetails = await fetchFormDetails(pool, form_id);

      res.status(201).json({
        message:
          "Form created successfully and version initialized. Owner role assigned.",
        form: formDetails,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

//Delete Form
router.delete(
  "/:id",
  authenticateUser,

  async (req: AuthRequest, res: Response, next: NextFunction) => {
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
  }
);

//Generate Sharing Link
router.get(
  "/:form_id/share-link",
  authenticateUser,

  async (req: AuthRequest, res: Response, next: NextFunction) => {
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

      const sharingLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;

      res.status(200).json({
        message: "Sharing link generated successfully.",
        link: sharingLink,
      });

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);
//Fetch all form responses
router.get(
  "/:form_id/responses",
  authenticateUser,

  async (req: AuthRequest, res: Response, next: NextFunction) => {
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
  }
);

//Form owner route for fetching form
router.get(
  "/:id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const form_id = parseInt(req.params.id);
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

      const form_details = await fetchFormDetails(pool, form_id);
      if (!form_details) {
        throw new HttpError("Form not found.", 404);
      }
      res.json(form_details);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

//Public route for accessing form
router.get("/respond", async (req: Request, res: Response) => {
  if (!req.query.token) {
    throw new HttpError("Token is required", 400);
  }
  const token = typeof req.query.token === "string" ? req.query.token : null;

  if (!token) {
    throw new HttpError("Token must be a single string", 400);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET!);
  if (typeof decoded !== "object" || !decoded.form_id || !decoded.version_id) {
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
});

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
router.get(
  "/:form_id/responses/:responseId/token",
  async (req: Request, res: Response, next: NextFunction) => {
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
  }
);

// Update form
router.patch(
  "/:id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);
    const {
      sections,
      settings,
      revision_id: old_revision_id,
    } = req.body as {
      sections: Section[];
      settings: QuizSettings;
      revision_id: string;
    };

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    if (!form_id) {
      throw new HttpError("Invalid form ID.", 400);
    }

    try {
      const roleCheckQuery = `
    SELECT r.name
    FROM form_user_roles fur
    JOIN roles r ON fur.role_id = r.role_id
    WHERE fur.form_id = $1 AND fur.user_id = $2;
  `;

      const roleResult = await pool.query<{ name: string }>(roleCheckQuery, [
        form_id,
        user_id,
      ]);

      if (
        roleResult.rowCount === 0 ||
        !["Owner", "Editor"].includes(roleResult.rows[0].name)
      ) {
        throw new HttpError(
          "Unauthorized to update this form. Only owners and editors are permitted.",
          403
        );
      }

      await pool.query("BEGIN");

      const conflict = await handleVersionConflict(
        pool,
        form_id,
        old_revision_id
      );
      if (conflict) {
        await pool.query("ROLLBACK");
        throw new HttpError(
          "Version conflict. Please refresh and reapply your changes.",
          409
        );
      }

      await updateOrCreateSettings(pool, settings, form_id, true);

      for (const section of sections) {
        const section_id = await handleSection(pool, form_id, section, true);
        for (const item of section.items) {
          await handleItem(pool, form_id, section_id, item, true);
        }
      }

      const currentRevision = (
        await pool.query<{ revision_id: string }>(
          "SELECT revision_id FROM form_versions WHERE form_id = $1 AND is_active = TRUE",
          [form_id]
        )
      ).rows[0].revision_id;

      const newRevisionId = incrementVersion(currentRevision);

      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
        [form_id]
      );

      const versionResult = await pool.query<{ version_id: number }>(
        "INSERT INTO form_versions(form_id, revision_id, content, is_active) VALUES($1, $2, $3::jsonb, TRUE) RETURNING version_id",
        [form_id, newRevisionId, JSON.stringify(req.body)]
      );

      const newVersionId = versionResult.rows[0].version_id;

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [newVersionId, form_id]
      );

      await pool.query("COMMIT");

      const form_details = await fetchFormDetails(pool, form_id);

      io.to(form_id.toString()).emit("formUpdated", form_details);

      res.status(200).json({
        message: "Form updated successfully",
        form_details: form_details,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
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
        SELECT fr.response_id, fr.create_time, fs.update_window_hours
        FROM form_responses fr
        JOIN forms f ON f.form_id = fr.form_id
        JOIN form_settings fs ON fs.settings_id = f.settings_id
        WHERE fr.form_id = $1 AND fr.response_id = $2 AND f.owner_id = $3;
      `;
    const permissionResult = await pool.query<{
      create_time: string;
      update_window_hours: number;
    }>(permissionCheckQuery, [form_id, response_id, user_id]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError(
        "Unauthorized to update this response or response not found.",
        403
      );
    }

    const { create_time, update_window_hours } = permissionResult.rows[0];
    const currentTime = new Date();
    const responseCreateTime = new Date(create_time);
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
