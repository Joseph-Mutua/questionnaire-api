import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import { pool } from "../../config/db";
import { createFormOrTemplate } from "../../helpers/createFormOrTemplate";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Create Template
router.post(
  "/",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;

    const { title, description, is_template, category_id, is_public } =
      req.body as {
        title: string;
        description: string;
        is_template: boolean;
        category_id?: number;
        is_public?: boolean;
      };

    try {
      const result = await createFormOrTemplate(
        pool,
        user_id!,
        { title, description, is_template, category_id, is_public },
        true
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
