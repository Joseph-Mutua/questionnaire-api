import { Router, Response, Request, NextFunction } from "express";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";
import {
  sendNewResponseAlert,
  sendSubmissionConfirmation,
} from "../../helpers/forms/formControllerHelpers";
import { FormResponseBody } from "../../types";
import asyncHandler from "../../utils/asyncHandler";
import HttpError from "../../utils/httpError";

const router = Router();

router.post(
  "/:form_id/responses",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { form_id } = req.params;
    const { answers, respondent_email } = req.body as FormResponseBody;

    try {
      await pool.query("BEGIN");

      const versionQuery = `
        SELECT version_id FROM form_versions
        WHERE form_id = $1 AND is_active = TRUE;
      `;

      const versionResult = await pool.query<{ version_id: number }>(
        versionQuery,
        [form_id]
      );

      const activeVersionId = versionResult.rows[0]?.version_id;

      if (!activeVersionId) {
        throw new HttpError("No active version found for this form.", 404);
      }

      const insertResponseQuery = `
        INSERT INTO form_responses (form_id, version_id, responder_email, created_at, updated_at, total_score)
        VALUES ($1, $2, $3, NOW(), NOW(), 0)
        RETURNING response_id;
      `;

      const responseResult = await pool.query<{ response_id: number }>(
        insertResponseQuery,
        [form_id, activeVersionId, respondent_email]
      );

      const response_id = responseResult.rows[0].response_id;
      let total_score = 0;

      // Insert answers
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

      await pool.query(
        "UPDATE form_responses SET response_token = $1 WHERE response_id = $2",
        [response_token, response_id]
      );

      // Send notifications
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
      }

      await pool.query("COMMIT");

      res.status(201).json({
        message: "Response submitted successfully",
        response_id: response_id,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      next(error);
    }
  })
);

export default router;
