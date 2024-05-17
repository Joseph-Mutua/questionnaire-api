/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { pool } from "../../config/db";

const router = Router();

router.post(
  "/categories",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { name, description } = req.body as {
      name: string;
      description: string;
    };

    try {
      const result = await pool.query<{ category_id: number }>(
        "INSERT INTO template_categories (name, description) VALUES ($1, $2) RETURNING category_id",
        [name, description]
      );

      res.status(201).json({
        message: "Category created successfully.",
        category_id: result.rows[0].category_id,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;