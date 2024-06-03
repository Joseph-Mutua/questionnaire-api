import { Router, Response, Request, NextFunction } from "express";
import { getSpecificFormResponse } from "../../helpers/forms/formControllerHelpers";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

//Get response by token
router.get(
  "/:form_id/responses/:responseId/token",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { response_token } = req.query as { response_token: string };

    if (!response_token) {
      throw new HttpError("Unauthorized", 401);
    }
    const decoded = jwt.verify(
      response_token.toString(),
      process.env.JWT_SECRET!
    ) as {
      response_id: number;
      form_id: number;
    };

    try {
      await pool.query("BEGIN");
      const validationResult = await pool.query(
        "SELECT response_id FROM form_responses WHERE response_id = $1 AND form_id = $2 AND response_token = $3",
        [decoded.response_id, decoded.form_id, response_token]
      );

      if (validationResult.rows.length === 0) {
        throw new HttpError("Invalid or expired token", 401);
      }
      await getSpecificFormResponse(req, res);

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);


export default router;
