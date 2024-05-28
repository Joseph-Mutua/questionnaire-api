import { Router, Response, NextFunction } from "express";

import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import {
  fetchFormDetails,
  handleSection,
  handleItem,
  incrementVersion,
  fetchQuestionDetails,
} from "../../helpers/forms/formControllerHelpers";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.post(
  "/create-from-template",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.body as { template_id: number };
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      const templateResult = await pool.query<{
        info_id: number;
        settings_id: number;
      }>(
        "SELECT info_id, settings_id FROM forms WHERE form_id = $1 AND is_template = TRUE",
        [template_id]
      );

      if (templateResult.rowCount === 0) {
        throw new HttpError("Template not found.", 404);
      }

      const { info_id, settings_id } = templateResult.rows[0];

      const formResult = await pool.query<{ form_id: number }>(
        `INSERT INTO forms (owner_id, info_id, settings_id, is_template, is_public, created_at, updated_at)
         VALUES ($1, $2, $3, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING form_id`,
        [user_id, info_id, settings_id]
      );
      const form_id = formResult.rows[0].form_id;

      const roleIdResult = await pool.query<{ role_id: number }>(
        "SELECT role_id FROM roles WHERE name = 'Owner'"
      );
      const ownerRoleId = roleIdResult.rows[0].role_id;

      await pool.query(
        "INSERT INTO form_user_roles (form_id, user_id, role_id) VALUES ($1, $2, $3)",
        [form_id, user_id, ownerRoleId]
      );

      const sectionsResult = await pool.query<{
        section_id: number;
        title: string;
        description: string;
        seq_order: number;
      }>(
        "SELECT section_id, title, description, seq_order FROM sections WHERE form_id = $1 ORDER BY seq_order",
        [template_id]
      );

      for (const section of sectionsResult.rows) {
        const newSectionId = await handleSection(
          pool,
          form_id,
          {
            title: section.title,
            description: section.description,
            seq_order: section.seq_order,
            items: [],
          },
          false
        );

        const itemsResult = await pool.query<{
          item_id: number;
          title: string;
          description: string;
          kind: string;
        }>(
          "SELECT item_id, title, description, kind FROM items WHERE section_id = $1",
          [section.section_id]
        );

        for (const item of itemsResult.rows) {
          await handleItem(
            pool,
            form_id,
            newSectionId,
            {
              title: item.title,
              description: item.description,
              kind: item.kind as
                | "QUESTION_ITEM"
                | "QUESTION_GROUP_ITEM"
                | "PAGE_BREAK_ITEM"
                | "TEXT_ITEM"
                | "IMAGE_ITEM",
              question:
                (await fetchQuestionDetails(pool, item.item_id)) ?? undefined,
              item_id: item.item_id,
            },
            true
          );
        }
      }

      const initialVersionId = incrementVersion("v1.0");
      const versionResult = await pool.query<{ version_id: number }>(
        `INSERT INTO form_versions (form_id, revision_id, content, is_active, created_at)
         VALUES ($1, $2, $3::jsonb, TRUE, CURRENT_TIMESTAMP)
         RETURNING version_id`,
        [form_id, initialVersionId, JSON.stringify({})]
      );

      const newVersionId = versionResult.rows[0].version_id;

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [newVersionId, form_id]
      );

      await pool.query("COMMIT");

      const formDetails = await fetchFormDetails(pool, form_id);

      res.status(201).json({
        message: "Form created successfully from template.",
        form: formDetails,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
