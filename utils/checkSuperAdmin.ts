import { Response, NextFunction } from "express";
import { pool } from "../config/db";
import { AuthRequest } from "../middleware/auth";

export const checkSuperAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const result = await pool.query(
      `SELECT role FROM users
       WHERE user_id = $1 AND role = 'SUPERADMIN'`,
      [user_id]
    );

    if (result.rowCount === 0) {
      return res
        .status(403)
        .json({ message: "Forbidden: Requires SUPERADMIN role" });
    }

    next();
  } catch (error) {
    next(error);
  }
};
