/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { QuizSettings, Section } from "../../types";
import {
  handleItem,
  handleSection,
  updateOrCreateSettings,
} from "../../helpers/forms/formControllerHelpers";

const router = Router();

router.patch(
  "/:template_id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.params;
    const { category_id, title, description, is_public, settings, sections } =
      req.body as {
        category_id: number;
        title: string;
        description: string;
        is_public: boolean;
        settings: QuizSettings;
        sections: Section[];
      };

    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      // Verify the category_id exists
      const categoryCheck = await pool.query(
        "SELECT category_id FROM template_categories WHERE category_id = $1",
        [category_id]
      );

      if (categoryCheck.rows.length === 0) {
        throw new HttpError("Category does not exist.", 400);
      }

      const infoResult = await pool.query<{ info_id: number }>(
        `UPDATE form_info 
         SET title = $1, description = $2 
         WHERE info_id = (SELECT info_id FROM templates WHERE template_id = $3 AND owner_id = $4) 
         RETURNING info_id`,
        [title, description, template_id, user_id]
      );

      if (infoResult.rowCount === 0) {
        throw new HttpError(
          "Template not found or you do not have permission to update this template.",
          404
        );
      }

      const info_id = infoResult.rows[0].info_id;

      const settings_id = await updateOrCreateSettings(
        pool,
        settings,
        Number(template_id),
        false
      );

      await pool.query(
        `UPDATE templates 
         SET category_id = $1, 
             info_id = $2, 
             settings_id = $3, 
             is_public = $4, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE template_id = $5 AND owner_id = $6`,
        [category_id, info_id, settings_id, is_public, template_id, user_id]
      );

      for (const section of sections) {
        const section_id = await handleSection(
          pool,
          Number(template_id),
          section,
          false
        );
        for (const item of section.items) {
          await handleItem(pool, Number(template_id), section_id, item, false);
        }
      }

      await pool.query("COMMIT");

      res
        .status(200)
        .json({ success: true, message: "Template updated successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);
export default router;
