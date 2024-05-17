/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { pool } from "../../config/db";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";

const router = Router();

// GET all responses for a specific form and revision
router.get(
  "/:form_id/revisions/:revision_id/responses",

  authenticateUser,
  async (req: AuthRequest, res: Response,  next: NextFunction) => {
    const { form_id, revision_id } = req.params;
    const user_id = req.user?.user_id;

    const permissionCheckQuery = `
        SELECT form_id FROM forms
        WHERE form_id = $1 AND owner_id = $2;
    `;

    try {
      await pool.query("BEGIN");
      const permissionResult = await pool.query(permissionCheckQuery, [
        form_id,
        user_id,
      ]);

      if (permissionResult.rowCount === 0) {
        throw new HttpError(
          "Unauthorized to view responses for this form.",
          403
        );
      }
      const versionQuery = `
        SELECT version_id FROM form_versions
        WHERE form_id = $1 AND revision_id = $2;
    `;
      const versionResult = await pool.query<{ version_id: number }>(
        versionQuery,
        [form_id, revision_id]
      );

      const version_id = versionResult.rows[0]?.version_id;

      const fetchResponsesQuery = `
        SELECT * FROM form_responses
        WHERE form_id = $1 AND version_id = $2;
    `;
      const responseResults = await pool.query(fetchResponsesQuery, [
        form_id,
        version_id,
      ]);

      if (responseResults.rowCount === 0)
        throw new HttpError(
          "No responses found for the specified revision.",
          404
        );
      await pool.query("COMMIT");
      res.status(200).json({
        success: true,
        message: "Responses retrieved successfully.",
        data: responseResults.rows,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

export default router;
