/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

const router = Router();


router.post(
  "/forms/from_template",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.body as { template_id: number };
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      const templateResult = await pool.query<{ info_id: number; settings_id: number }>(
        "SELECT info_id, settings_id FROM templates WHERE template_id = $1",
        [template_id]
      );

      if (templateResult.rows.length === 0) {
        throw new HttpError("Template not found.", 404);
      }

      const { info_id, settings_id } = templateResult.rows[0];

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