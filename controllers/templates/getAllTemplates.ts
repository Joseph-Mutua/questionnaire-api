import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Get all templates
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(`
        SELECT f.form_id AS template_id, f.is_public, f.created_at, f.updated_at,
               tc.name AS category_name, u.email AS owner_email, f.title, f.description,
               f.is_quiz, f.update_window_hours, f.wants_email_updates
        FROM forms f
        JOIN template_categories tc ON f.category_id = tc.category_id
        JOIN users u ON f.owner_id = u.user_id
        WHERE f.is_template = TRUE
      `);

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
