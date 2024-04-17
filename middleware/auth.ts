import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type UserRequest = Request & { user?: { userId: string } };

export const authenticateUser = (
  req: UserRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1] || "";

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    if (typeof decoded !== "string" && decoded.userId) {
      req.user = { userId: decoded.userId };
      next();
    } else {
      res.status(401).send({ message: "Authentication failed!" });
    }
  } catch (error) {
    res.status(401).send({ message: "Authentication failed!" });
  }
};
