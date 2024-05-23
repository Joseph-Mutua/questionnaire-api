/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";

import { pool } from "../../config/db";

const router = Router();

// Generate Sharing Link for Active Form Version
import jwt from "jsonwebtoken";
import asyncHandler from "../../utils/asyncHandler";

router.get(
  "/:form_id/share_link",

  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    try {
      await pool.query("BEGIN");

      const result = await pool.query<{ active_version_id: number }>(
        "SELECT active_version_id FROM forms WHERE form_id = $1",
        [form_id]
      );

      if (result.rows.length === 0) {
        throw new HttpError("Form not found.", 404);
      }

      const activeVersionId = result.rows[0].active_version_id;

      if (!activeVersionId) {
        throw new HttpError("Active version not set for this form.", 404);
      }

      const payload = {
        form_id: form_id,
        version_id: activeVersionId,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: "1d",
      });

      await pool.query("COMMIT");
      const sharingLink = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;

      res.status(200).json({
        message: "Sharing link generated successfully.",
        link: sharingLink,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
