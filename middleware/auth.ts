import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";

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

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    if (typeof decoded !== "string" && decoded.userId) {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE user_id = $1",
        [decoded.userId]
      );

      if (rows.length > 0) {
        req.user = rows[0];
        next();
      } else {
        res.status(404).send({ message: "User not found!" });
      }
    } else {
      res.status(401).send({ message: "Authentication failed!" });
    }
  } catch (error) {
    res.status(401).send({ message: "Authentication failed!" });
  }
};
