/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request, NextFunction } from "express";
import { authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

const router = Router();

//Get Specific Form Response
router.get(
  "/:form_id/responses/:responseId",
  authenticateUser,

  async (req: Request, res: Response, next: NextFunction) => {
    const { form_id, responseId } = req.params;

    try {

      await pool.query("BEGIN")
      const query = `
            SELECT r.response_id, r.form_id, r.responder_email, r.create_time, r.last_submitted_time, r.total_score, 
                   json_agg(json_build_object(
                       'questionId', a.question_id,
                       'value', a.value,
                       'score', a.score,
                       'feedback', a.feedback
                   )) AS answers
            FROM form_responses r
            JOIN answers a ON r.response_id = a.response_id
            WHERE r.form_id = $1 AND r.response_id = $2
            GROUP BY r.response_id;
        `;
      const { rows } = await pool.query(query, [form_id, responseId]);
      if (rows.length > 0) {
        res.json(rows[0]);
      } else {
        throw new HttpError("Response not found.", 404);
      }

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  }
);

export default router;
