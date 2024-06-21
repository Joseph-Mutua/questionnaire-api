import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Set Active Version
router.post(
  "/:form_id/activate-version",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const { revision_id } = req.body as { revision_id: number };
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      // Check if the revision_id exists for the form
      const revisionResult = await pool.query<{
        revision_id: number;
      }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 AND revision_id = $2",
        [form_id, revision_id]
      );

      if (revisionResult.rows.length === 0) {
        throw new HttpError("No matching revision found for this form.", 404);
      }

      // Deactivate all versions of the form
      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
        [form_id]
      );

      // Activate the specified revision
      await pool.query(
        "UPDATE form_versions SET is_active = TRUE WHERE form_id = $1 AND revision_id = $2",
        [form_id, revision_id]
      );

      await pool.query("COMMIT");

      res.status(200).json({
        message: "Active version updated successfully.",
        success: true,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
