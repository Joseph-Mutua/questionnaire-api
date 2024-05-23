/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import { updateFormOrTemplate } from "../../helpers/updateFormOrTemplate";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();
router.patch(
  "/:id",

  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user_id = req.user?.user_id;
    const template_id = parseInt(req.params.id);

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await updateFormOrTemplate(pool, template_id, user_id, req.body, res, next);

  })
);
export default router;
