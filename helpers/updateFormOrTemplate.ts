import { Pool } from "pg";
import { Response, NextFunction } from "express";
import {
  fetchFormDetails,
  handleItem,
  handleSection,
  incrementVersion,
  updateOrCreateNavigationRule,
} from "../helpers/forms/formControllerHelpers";
import { Feedback, NavigationRule, Section } from "../types";
import HttpError from "../utils/httpError";
import { io } from "../server";

export async function updateFormOrTemplate(
  pool: Pool,
  form_id: number,
  user_id: number,
  body: {
    title: string;
    description: string;
    revision_id: string;
    category_id: number;
    is_public: boolean;
    is_quiz: boolean;
    sections: Section[];
    settings: {
      update_window_hours: number;
      wants_email_updates: boolean;
    };
    feedbacks: Feedback[];
    navigation_rules: NavigationRule[];
  },
  res: Response,
  next: NextFunction
) {
  const {
    title,
    description,
    category_id,
    is_public,
    is_quiz,
    sections,
    navigation_rules,
  } = body;

  if (!user_id) throw new HttpError("User must be logged in.", 403);
  if (!form_id) throw new HttpError("Invalid form ID.", 400);

  const isTemplate = category_id !== undefined;

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
        "Unauthorized to update this form or template. Only owners and editors are permitted.",
        403
      );
    }

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE forms 
       SET title = $1, 
           description = $2, 
           category_id = $3, 
           is_public = $4, 
           is_quiz = $5,
           updated_at = CURRENT_TIMESTAMP 
       WHERE form_id = $6 AND owner_id = $7`,
      [title, description, category_id, is_public, is_quiz, form_id, user_id]
    );


    for (const section of sections) {
      const section_id = await handleSection(pool, form_id, section);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item, !isTemplate);
      }
    }

    if (navigation_rules) {
      for (const rule of navigation_rules) {
        await updateOrCreateNavigationRule(pool, rule);
      }
    }

    if (!isTemplate) {
      const currentHighestRevisionResult = await pool.query<{
        revision_id: string;
      }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 ORDER BY revision_id DESC LIMIT 1",
        [form_id]
      );

      if (currentHighestRevisionResult.rowCount === 0) {
        throw new HttpError("No revisions found for this form.", 404);
      }

      const currentHighestRevision =
        currentHighestRevisionResult.rows[0].revision_id;
      const newRevisionId = incrementVersion(currentHighestRevision);

      await pool.query(
        "INSERT INTO form_versions (form_id, revision_id, content, is_active) VALUES ($1, $2, $3::jsonb, TRUE)",
        [form_id, newRevisionId, JSON.stringify(body)]
      );

      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1 AND revision_id != $2",
        [form_id, newRevisionId]
      );

      await pool.query(
        "UPDATE forms SET active_version_id = (SELECT version_id FROM form_versions WHERE form_id = $1 AND revision_id = $2) WHERE form_id = $1",
        [form_id, newRevisionId]
      );
    }

    await pool.query("COMMIT");

    const form_details = await fetchFormDetails(pool, form_id);
    io.to(form_id.toString()).emit("formUpdated", form_details);

    res.status(200).json({
      message: isTemplate
        ? "Template updated successfully"
        : "Form updated successfully",
      form_details: form_details,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    next(error);
  }
}