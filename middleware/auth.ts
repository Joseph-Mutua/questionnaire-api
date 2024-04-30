import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import HttpError from "../utils/httpError";

export type AuthRequest = Request & {
  user?: {
    user_id: number;
    email: string;
    password: string;
  };
};

export const authenticateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1] || "";
  const decoded = jwt.verify(token, process.env.JWT_SECRET!);

  if (typeof decoded !== "string" && decoded.userId) {
    const { rows } = await pool.query<{
      user_id: number;
      email: string;
      password: string;
    }>("SELECT * FROM users WHERE user_id = $1", [decoded.userId]);

    if (rows.length > 0) {
      req.user = rows[0];

      next();
    } else {
      throw new HttpError("User not found!", 404);
    }
  } else {
    throw new HttpError("Authentication failed!", 401);
  }
};
