import { Pool } from "pg";
import { Response, NextFunction } from "express";
import {
  fetchFormDetails,
  handleItem,
  handleSection,
  handleVersionConflict,
  incrementVersion,
  updateOrCreateSettings,
} from "../helpers/forms/formControllerHelpers";
import { QuizSettings, Section } from "../types";
import HttpError from "../utils/httpError";
import { io } from "../server";

export async function updateFormOrTemplate(
  pool: Pool,
  form_id: number,
  user_id: number,
  body: {
    title?: string;
    description?: string;
    is_template: boolean;
    category_id?: number;
    is_public?: boolean;
    sections: Section[];
    settings: QuizSettings;
    revision_id: string;
  },
  res: Response,
  next: NextFunction
) {
  const {
    title,
    description,
    is_template,
    category_id,
    is_public,
    sections,
    settings,
    revision_id: old_revision_id,
  } = body;

  if (!user_id) throw new HttpError("User must be logged in.", 403);
  if (!form_id) throw new HttpError("Invalid form ID.", 400);

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
        "Unauthorized to update this form or template. Only owners and editors are permitted.",
        403
      );
    }

    await pool.query("BEGIN");

    const infoResult = await pool.query<{ info_id: number }>(
      `UPDATE form_info 
       SET title = $1, description = $2 
       WHERE info_id = (SELECT info_id FROM forms WHERE form_id = $3 AND owner_id = $4) 
       RETURNING info_id`,
      [title, description, form_id, user_id]
    );

    if (infoResult.rowCount === 0) {
      throw new HttpError(
        "Form or template not found or you do not have permission to update it.",
        404
      );
    }

    const info_id = infoResult.rows[0].info_id;

    const settings_id = await updateOrCreateSettings(pool, settings, form_id);

    await pool.query(
      `UPDATE forms 
       SET info_id = $1, 
           settings_id = $2, 
           is_template = $3, 
           category_id = $4, 
           is_public = $5, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE form_id = $6 AND owner_id = $7`,
      [
        info_id,
        settings_id,
        is_template,
        category_id,
        is_public,
        form_id,
        user_id,
      ]
    );

    for (const section of sections) {
      const section_id = await handleSection(
        pool,
        form_id,
        section,
        is_template
      );
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item, !is_template);
      }
    }

    if (!is_template) {
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
        [form_id, newRevisionId, JSON.stringify(body)]
      );

      const newVersionId = versionResult.rows[0].version_id;

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [newVersionId, form_id]
      );
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
