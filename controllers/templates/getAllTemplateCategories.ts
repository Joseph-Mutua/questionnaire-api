import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Fetch all template categories
router.get(
  "/template-categories",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        "SELECT * FROM template_categories ORDER BY name"
      );
      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
