
import { Router, Response, NextFunction } from "express";
import { pool } from "../../config/db";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// DELETE a specific form response by response_id
router.delete(
  "/:response_id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { response_id } = req.params;
    const user_id = req.user?.user_id;

    const permissionCheckQuery = `
        SELECT r.response_id FROM form_responses r
        JOIN forms f ON f.form_id = r.form_id
        WHERE r.response_id = $1 AND f.owner_id = $2;
      `;

    const permissionResult = await pool.query(permissionCheckQuery, [
      response_id,
      user_id,
    ]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError("Unauthorized to delete this response.", 403);
    }

    try {
      await pool.query("BEGIN");

      const deleteAnswersQuery = `
        DELETE FROM answers
        WHERE response_id = $1;
      `;

      await pool.query(deleteAnswersQuery, [response_id]);

      const deleteResponseQuery = `
        DELETE FROM form_responses
        WHERE response_id = $1;
      `;
      await pool.query(deleteResponseQuery, [response_id]);

      await pool.query("COMMIT");
      res.status(200).json({ message: "Response deleted successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
