/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../config/db";

const router = Router();

//Get all templates

router.get(
  "/templates",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(`
        SELECT t.template_id, t.is_public, t.created_at, t.updated_at,
               tc.name AS category_name, u.email AS owner_email, fi.title, fi.description
        FROM templates t
        JOIN template_categories tc ON t.category_id = tc.category_id
        JOIN users u ON t.owner_id = u.user_id
        JOIN form_info fi ON t.info_id = fi.info_id
      `);

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

export default router;