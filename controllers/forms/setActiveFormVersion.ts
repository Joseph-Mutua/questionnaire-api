import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";
import { incrementVersion } from "../../helpers/forms/formControllerHelpers";

const router = Router();

// Set Active Version
router.post(
  "/:form_id/activate-version",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const { revision_id } = req.body as { revision_id: string };
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      // Check if the revision_id exists for the form
      const revisionResult = await pool.query<{
        version_id: number;
      }>(
        "SELECT version_id FROM form_versions WHERE form_id = $1 AND revision_id = $2",
        [form_id, revision_id]
      );

      if (revisionResult.rows.length === 0) {
        throw new HttpError("No matching revision found for this form.", 404);
      }

      // Find the current highest revision
      const currentHighestRevisionResult = await pool.query<{
        revision_id: string;
      }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 ORDER BY revision_id DESC LIMIT 1",
        [form_id]
      );

      if (currentHighestRevisionResult.rows.length === 0) {
        throw new HttpError("No revisions found for this form.", 404);
      }

      const currentHighestRevision =
        currentHighestRevisionResult.rows[0].revision_id;
      const newRevisionId = incrementVersion(currentHighestRevision);

      // Update the provided revision to the new highest revision
      const { version_id } = revisionResult.rows[0];
      await pool.query(
        "UPDATE form_versions SET revision_id = $1 WHERE version_id = $2",
        [newRevisionId, version_id]
      );

      // Deactivate all versions of the form
      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
        [form_id]
      );

      // Activate the new highest revision
      await pool.query(
        "UPDATE form_versions SET is_active = TRUE WHERE version_id = $1 AND form_id = $2",
        [version_id, form_id]
      );

      // Update the active version in the forms table
      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [version_id, form_id]
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
