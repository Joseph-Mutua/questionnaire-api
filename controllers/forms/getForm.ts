import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.get(
  "/:form_id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const form_id = parseInt(req.params.form_id);
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
        SELECT role FROM form_user_roles
        WHERE form_id = $1 AND user_id = $2;
      `;
      const roleResult = await pool.query<{ role: string }>(roleCheckQuery, [
        form_id,
        user_id,
      ]);

      if (
        roleResult.rowCount === 0 ||
        !roleResult.rows.some((row) =>
          ["OWNER", "EDITOR", "VIEWER"].includes(row.role)
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
    
  })
);

export default router;
