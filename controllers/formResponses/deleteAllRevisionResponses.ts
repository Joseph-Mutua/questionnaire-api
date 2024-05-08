/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response } from "express";
import { pool } from "../../config/db";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";

const router = Router();

// DELETE all responses for a specific form and revision
router.delete(
  "/:form_id/revisions/:revision_id/responses",
  authenticateUser,

  async (req: AuthRequest, res: Response) => {
    const { form_id, revision_id } = req.params;
    const user_id = req.user?.user_id;

    const permissionCheckQuery = `
        SELECT form_id FROM forms
        WHERE form_id = $1 AND owner_id = $2;
      `;

    const permissionResult = await pool.query(permissionCheckQuery, [
      form_id,
      user_id,
    ]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError(
        "Unauthorized to delete responses for this form.",
        403
      );
    }

    await pool.query("BEGIN");

    const versionQuery = `
        SELECT version_id FROM form_versions
        WHERE form_id = $1 AND revision_id = $2;
      `;

    const versionResult = await pool.query<{ version_id: number }>(
      versionQuery,
      [form_id, revision_id]
    );

    const version_id = versionResult.rows[0]?.version_id;

    // Delete responses for the specific form version
    const deleteQuery = `
        DELETE FROM form_responses
        WHERE form_id = $1 AND version_id = $2;
      `;
    await pool.query(deleteQuery, [form_id, version_id]);

    await pool.query("COMMIT");
    res.status(200).json({
      success: true,
      message:
        "All responses for the specified revision have been deleted successfully.",
    });
  }
);

export default router;
