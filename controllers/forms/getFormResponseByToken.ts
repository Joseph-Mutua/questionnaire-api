/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import { getSpecificFormResponse } from "../../helpers/forms/formControllerHelpers";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

const router = Router();

//Get response by token
router.get(
  "/:form_id/responses/:responseId/token",
    async (req: Request, res: Response) => {
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

    const validationResult = await pool.query(
      "SELECT response_id FROM form_responses WHERE response_id = $1 AND form_id = $2 AND response_token = $3",
      [decoded.response_id, decoded.form_id, response_token]
    );
    if (validationResult.rows.length === 0) {
      throw new HttpError("Invalid or expired token", 401);
    }
    await getSpecificFormResponse(req, res);
  }
);

export default router;