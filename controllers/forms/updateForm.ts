import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import asyncHandler from "../../utils/asyncHandler";
import { pool } from "../../config/db";
import { Pool } from "pg";

const router = Router();

import {
  fetchFormDetails,
  handleItem,
  handleSection,
  updateOrCreateNavigationRule,
} from "../../helpers/forms/formControllerHelpers";
import { NavigationRule, Section } from "../../types";
import HttpError from "../../utils/httpError";
import { io } from "../../server";

export async function updateForm(
  pool: Pool,
  form_id: number,
  user_id: number,
  body: {
    title: string;
    description: string;
    is_quiz: boolean;
    sections: Section[];
    settings: {
      response_update_window: number;
      wants_email_updates: boolean;
    };
    navigation_rules: NavigationRule[];
  },
  res: Response,
  next: NextFunction
) {
  const { title, description, is_quiz, sections, navigation_rules, settings } =
    body;

  if (!user_id) throw new HttpError("User must be logged in.", 403);
  if (!form_id) throw new HttpError("Invalid form ID.", 400);

  try {
    const roleCheckQuery = `
      SELECT role
      FROM form_user_roles
      WHERE form_id = $1 AND user_id = $2;
    `;

    const roleResult = await pool.query<{ role: string }>(roleCheckQuery, [
      form_id,
      user_id,
    ]);

    if (
      roleResult.rowCount === 0 ||
      !["OWNER", "EDITOR"].includes(roleResult.rows[0].role)
    ) {
      throw new HttpError(
        "Unauthorized to update this form. Only owners and editors are permitted.",
        403
      );
    }

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE forms 
       SET title = $1, 
           description = $2, 
           is_quiz = $3,
           response_update_window = $4,
           wants_email_updates = $5,
           updated_at = CURRENT_TIMESTAMP 
       WHERE form_id = $6 AND owner_id = $7`,
      [
        title,
        description,
        is_quiz,
        settings.response_update_window,
        settings.wants_email_updates,
        form_id,
        user_id,
      ]
    );

    const currentHighestRevisionResult = await pool.query<{
      revision_id: number;
    }>(
      "SELECT revision_id FROM form_versions WHERE form_id = $1 ORDER BY revision_id DESC LIMIT 1",
      [form_id]
    );

    const currentHighestRevision =
      currentHighestRevisionResult.rows[0].revision_id;
    const newRevisionId = currentHighestRevision + 1;

    await pool.query(
      "INSERT INTO form_versions (form_id, revision_id, is_active) VALUES ($1, $2, TRUE)",
      [form_id, newRevisionId]
    );

    await pool.query(
      "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1 AND revision_id != $2",
      [form_id, newRevisionId]
    );

    for (const section of sections) {
      const section_id = await handleSection(
        pool,
        form_id,
        newRevisionId,
        section
      );
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, newRevisionId, item);
      }
    }

    if (navigation_rules) {
      for (const rule of navigation_rules) {
        await updateOrCreateNavigationRule(pool, rule);
      }
    }

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


router.patch(
  "/:form_id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const { form_id } = req.params;

    const {
      title,
      description,
      is_quiz,
      sections,
      settings,
      navigation_rules,
    } = req.body as {
      title: string;
      description: string;
      is_quiz: boolean;
      sections: Section[];
      settings: {
        response_update_window: number;
        wants_email_updates: boolean;
      };
      navigation_rules: NavigationRule[];
    };

    try {
      await updateForm(
        pool,
        parseInt(form_id, 10),
        user_id!,
        {
          title,
          description,
          is_quiz,
          sections,
          settings,
          navigation_rules,
        },
        res,
        next
      );
    } catch (error) {
      next(error);
    }
  })
);


export default router;