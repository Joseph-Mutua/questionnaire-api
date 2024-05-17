/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

const router = Router();

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
  }
);

export default router;
