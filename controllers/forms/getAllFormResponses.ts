import { Router, Response, NextFunction } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { FormDetailsRequestBody } from "../../types";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

//Fetch all form responses
router.get(
  "/:form_id/responses",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      throw new HttpError(
        "User must be logged in to access form responses.",
        403
      );
    }

    try {
      await pool.query("BEGIN");
      const query = `
            SELECT r.response_id, r.form_id, r.responder_email, r.created_at, r.updated_at, r.total_score,
                   json_agg(json_build_object(
                       'questionId', a.question_id,
                       'value', a.value,
                       'score', a.score,
                       'feedback', a.feedback
                   )) AS answers
            FROM form_responses r
            JOIN answers a ON r.response_id = a.response_id
            WHERE r.form_id = $1
            GROUP BY r.response_id
            ORDER BY r.created_at DESC;
        `;

      const { rows } = await pool.query<FormDetailsRequestBody>(query, [
        form_id,
      ]);
      if (rows.length > 0) {
        res.json(
          rows.map((row) => ({
            ...row,
            answers: row.answers,
          }))
        );
        await pool.query("BEGIN");
      } else {
        throw new HttpError("No responses found for this form.", 404);
      }
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);


export default router;
