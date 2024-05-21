/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { pool } from "../../config/db";
import { createFormOrTemplate } from "../../helpers/createFormOrTemplate";

const router = Router();
router.post(
  "/",
  authenticateUser,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description } = req.body as {
      title: string;
      description: string;
    };

    try {
      const result = await createFormOrTemplate(
        pool,
        user_id!,
        { title, description },
        false
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
