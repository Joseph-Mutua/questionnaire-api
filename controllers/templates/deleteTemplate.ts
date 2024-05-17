/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

const router = Router();

router.delete(
  "/templates/:template_id",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { template_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      await pool.query("BEGIN");

      await pool.query(
        "DELETE FROM templates WHERE template_id = $1 AND owner_id = $2",
        [template_id, user_id]
      );

      await pool.query("COMMIT");

      res.status(200).json({ message: "Template deleted successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

export default router;
