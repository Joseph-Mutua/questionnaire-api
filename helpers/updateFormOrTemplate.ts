import { Pool } from "pg";
import { Response, NextFunction } from "express";
import {
  fetchFormDetails,
  handleItem,
  handleSection,
  handleVersionConflict,
  incrementVersion,
  updateOrCreateFeedback,
  updateOrCreateMediaProperties,
  updateOrCreateNavigationRule,
  updateOrCreateQuizSettings,
  updateOrCreateSettings,
} from "../helpers/forms/formControllerHelpers";
import {
  Feedback,
  MediaProperties,
  NavigationRule,
  QuizSettings,
  Section,
} from "../types";
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
    category_id?: number;
    is_public: boolean;
    is_template: boolean;
    sections: Section[];
    settings: QuizSettings;
    quiz_settings: QuizSettings;
    feedbacks: Feedback[];
    media_properties: MediaProperties;
    navigation_rules: NavigationRule[];
  },
  res: Response,
  next: NextFunction
) {
  const {
    title,
    description,
    revision_id: old_revision_id,
    category_id,
    is_public,
    is_template,
    sections,
    settings,
    quiz_settings,
    feedbacks,
    media_properties,
    navigation_rules,
  } = body;

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
        "Unauthorized to update this form or template. Only owners and editors are permitted.",
        403
      );
    }

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE forms 
       SET title = $1, 
           description = $2, 
           is_template = $3, 
           category_id = $4, 
           is_public = $5, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE form_id = $6 AND owner_id = $7`,
      [
        title,
        description,
        is_template,
        category_id || null,
        is_public,
        form_id,
        user_id,
      ]
    );

    await updateOrCreateQuizSettings(pool, quiz_settings, form_id);
    await updateOrCreateSettings(pool, settings, form_id);

    for (const feedback of feedbacks) {
      await updateOrCreateFeedback(pool, feedback);
    }

    const mediaPropertiesId = await updateOrCreateMediaProperties(
      pool,
      media_properties
    );

    const sectionIdMap = new Map<number, number>();

    for (const section of sections) {
      const section_id = await handleSection(
        pool,
        form_id,
        section,
        is_template
      );
      sectionIdMap.set(section.seq_order, section_id);
      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item, !is_template);
      }
    }

    for (const rule of navigation_rules) {
      const section_id = sectionIdMap.get(rule.section_id);
      const target_section_id = sectionIdMap.get(rule.target_section_id);
      if (section_id && target_section_id) {
        await updateOrCreateNavigationRule(pool, {
          ...rule,
          section_id,
          target_section_id,
        });
      } else {
        throw new HttpError("Section ID not found for navigation rule.", 400);
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
        "INSERT INTO form_versions (form_id, revision_id, content, is_active) VALUES ($1, $2, $3::jsonb, TRUE) RETURNING version_id",
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
