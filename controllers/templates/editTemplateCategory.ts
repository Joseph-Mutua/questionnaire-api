import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { pool } from "../../config/db";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Update Template Category
router.put(
  "/categories/:id",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { name, description } = req.body as {
      name: string;
      description: string;
    };
    try {
      await pool.query("BEGIN");
      const result = await pool.query<{ category_id: number }>(
        "UPDATE template_categories SET name = $1, description = $2 WHERE category_id = $3 RETURNING category_id, name, description",
        [name, description, id]
      );
      await pool.query("COMMIT");
      res.status(200).json({
        message: "Category updated successfully.",
        category: result.rows[0],
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
