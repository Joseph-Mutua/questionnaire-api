/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";
import {
  sendNewResponseAlert,
  sendSubmissionConfirmation,
} from "../../helpers/forms/formControllerHelpers";
import { FormResponseBody } from "../../types";

const router = Router();

//Submit form response
router.post(
  "/:form_id/responses",
    
    async (req: Request, res: Response) => {
    const { form_id } = req.params;
    const { answers, respondent_email } = req.body as FormResponseBody;

    await pool.query("BEGIN");

    const insertResponseQuery = `
      INSERT INTO form_responses (form_id, responder_email, create_time, last_submitted_time, total_score)
      VALUES ($1, $2, NOW(), NOW(), 0)
      RETURNING response_id;
    `;
    const responseResult = await pool.query<{ response_id: number }>(
      insertResponseQuery,
      [form_id, respondent_email]
    );
    const response_id = responseResult.rows[0].response_id;

    let total_score = 0;

    for (const [question_id, answer_details] of Object.entries(answers)) {
      const score = answer_details.grade ? answer_details.grade.score : 0;
      const feedback = answer_details.grade
        ? JSON.stringify(answer_details.grade.feedback)
        : null;
      const answer_value = answer_details.text_answers
        ? JSON.stringify(answer_details.text_answers.answers)
        : "{}";

      const insertAnswerQuery = `
        INSERT INTO answers (response_id, question_id, value, score, feedback)
        VALUES ($1, $2, $3, $4, $5);
      `;

      await pool.query(insertAnswerQuery, [
        response_id,
        question_id,
        answer_value,
        score,
        feedback,
      ]);
      total_score += score;
    }

    await pool.query(
      "UPDATE form_responses SET total_score = $1 WHERE response_id = $2",
      [total_score, response_id]
    );
    const response_token = jwt.sign(
      { response_id, form_id },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    if (respondent_email) {
      await sendSubmissionConfirmation(
        respondent_email,
        response_id,
        Number(form_id),
        response_token
      );

      await sendNewResponseAlert(
        Number(form_id),
        response_id,
        respondent_email,
        response_token
      );

      await pool.query(
        "UPDATE form_responses SET response_token = $1 WHERE response_id = $2",
        [response_token, response_id]
      );
    }
    await pool.query("COMMIT");

    res.status(201).json({
      message: "Response submitted successfully",
      response_id: response_id,
    });
  }

);

export default router;