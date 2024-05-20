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
      `SELECT r.name FROM roles r
             JOIN user_roles ur ON r.role_id = ur.role_id
             WHERE ur.user_id = $1 AND r.name = 'SuperAdmin'`,
      [user_id]
    );

    if (result.rowCount === 0) {
      return res
        .status(403)
        .json({ message: "Forbidden: Requires SuperAdmin role" });
    }

    next();
  } catch (error) {
    next(error);
  }
};
