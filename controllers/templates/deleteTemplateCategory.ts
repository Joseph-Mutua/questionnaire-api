/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { checkSuperAdmin } from "../../utils/checkSuperAdmin";
import { pool } from "../../config/db";

const router = Router();

// Delete Template Category
router.delete(
  "/categories/:id",
  authenticateUser,
  checkSuperAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
      await pool.query("BEGIN");
      await pool.query<{ category_id: number }>(
        "DELETE FROM template_categories WHERE category_id = $1 RETURNING category_id",
        [id]
      );
      await pool.query("COMMIT");

      res.status(200).json({
        success: true,
        message: "Category deleted successfully.",
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

export default router;
