import { Router, Request, Response, NextFunction } from "express";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.get(
  "/templates/:template_id/preview",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { template_id } = req.params;

    try {
      const result = await pool.query(
        `
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description, fs.*
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
        JOIN form_settings fs ON t.settings_id = fs.settings_id
        WHERE t.template_id = $1
      `,
        [template_id]
      );

      if (result.rows.length === 0) {
        throw new HttpError("Template not found.", 404);
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
