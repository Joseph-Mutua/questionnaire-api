/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.get(
  "/my_templates",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    if (!user_id) throw new HttpError("User must be logged in.", 403);

    try {
      const result = await pool.query(
        `
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
        WHERE t.owner_id = $1
      `,
        [user_id]
      );

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
