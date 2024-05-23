/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

//Delete Form
router.delete(
  "/:id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const form_id = parseInt(req.params.id);

    if (!user_id) {
      throw new HttpError("User must be logged in to delete forms.", 403);
    }
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }
    try {
      await pool.query("BEGIN");

      await pool.query(
        "DELETE FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1 )",
        [form_id]
      );
      await pool.query(
        "DELETE FROM questions WHERE question_id IN (SELECT question_id FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1))",
        [form_id]
      );
      await pool.query(
        "DELETE FROM options WHERE question_id IN (SELECT question_id FROM questions WHERE question_id IN (SELECT question_id FROM question_items WHERE item_id IN (SELECT item_id FROM items WHERE form_id = $1)))",
        [form_id]
      );
      await pool.query("DELETE FROM items WHERE form_id = $1", [form_id]);
      await pool.query("DELETE FROM sections WHERE form_id = $1", [form_id]);
      await pool.query(
        "DELETE FROM forms WHERE form_id = $1 AND owner_id = $2",
        [form_id, user_id]
      );

      await pool.query("COMMIT");
      res.json({ message: "Form deleted successfully." });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
