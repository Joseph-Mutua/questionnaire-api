/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { incrementVersion } from "../../helpers/forms/formControllerHelpers";

const router = Router();

// Set Active Version
router.patch(
  "/:form_id/activate_version/:version_id",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    const { form_id, version_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      // Fetch the highest current revision_id in form_versions for this form
      const currentHighestRevisionResult = await pool.query<{ revision_id: string }>(
        "SELECT revision_id FROM form_versions WHERE form_id = $1 ORDER BY revision_id DESC LIMIT 1",
        [form_id]
      );
      const currentHighestRevision = currentHighestRevisionResult.rows[0]?.revision_id;

      if (!currentHighestRevision) {
        throw new HttpError("No revisions found for this form.", 404);
      }

      const newRevisionId = incrementVersion(currentHighestRevision);
      await pool.query(
        "UPDATE form_versions SET revision_id = $1 WHERE version_id = $2 AND form_id = $3",
        [newRevisionId, version_id, form_id]
      );

      await pool.query(
        "UPDATE form_versions SET is_active = FALSE WHERE form_id = $1",
        [form_id]
      );
      await pool.query(
        "UPDATE form_versions SET is_active = TRUE WHERE version_id = $1 AND form_id = $2",
        [version_id, form_id]
      );

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [version_id, form_id]
      );

      await pool.query("COMMIT");

      res.status(200).json({ message: "Active version updated and revision incremented successfully.", success: true });
    } catch (error) {
      await pool.query("ROLLBACK");
     // throw new HttpError(error);
    }
  }
);


export default router;
