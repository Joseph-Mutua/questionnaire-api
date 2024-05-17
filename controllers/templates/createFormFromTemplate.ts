/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import {
  fetchFormDetails,
  handleSection,
  handleItem,
} from "../../helpers/forms/formControllerHelpers";
import { Item } from "../../types";

const router = Router();

router.post(
  "/forms/create-from-template",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.body as { template_id: number };
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      const templateResult = await pool.query<{
        info_id: number;
        settings_id: number;
      }>("SELECT info_id, settings_id FROM templates WHERE template_id = $1", [
        template_id,
      ]);

      if (templateResult.rows.length === 0) {
        throw new HttpError("Template not found.", 404);
      }

      const { info_id, settings_id } = templateResult.rows[0];

      // Create a new form with the copied info_id and settings_id from the template
      const formResult = await pool.query<{ form_id: number }>(
        "INSERT INTO forms (owner_id, info_id, settings_id) VALUES ($1, $2, $3) RETURNING form_id",
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

      // Fetch sections and items from the template and copy them to the new form
      const sectionsResult = await pool.query<{
        section_id: number;
        title: string;
        description: string;
        seq_order: number;
        items: Item[];
      }>(
        "SELECT section_id, title, description, seq_order FROM sections WHERE form_id = $1 ORDER BY seq_order",
        [template_id]
      );

      for (const section of sectionsResult.rows) {
        const newSectionId = await handleSection(pool, form_id, section, true);

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
          await handleItem(pool, form_id, newSectionId, item, true);
        }
      }

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
  }
);

export default router;
