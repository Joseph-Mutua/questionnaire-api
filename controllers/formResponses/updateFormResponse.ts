import { Router, Response, NextFunction} from "express";
import { pool } from "../../config/db";
import { AuthRequest } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { FormResponseBody } from "../../types";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

// Update form response within a permissible time window
router.patch(
  "/:form_id/responses/:response_id",

  asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { form_id, response_id } = req.params;
    const { answers } = req.body as FormResponseBody;
    const user_id = req.user?.user_id;


    try{    await pool.query("BEGIN");

    const permissionCheckQuery = `
        SELECT fr.response_id, fr.created_at, f.update_window_hours
        FROM form_responses fr
        JOIN forms f ON f.form_id = fr.form_id
        WHERE fr.form_id = $1 AND fr.response_id = $2 AND f.owner_id = $3;
      `;
    const permissionResult = await pool.query<{
      created_at: string;
      update_window_hours: number;
    }>(permissionCheckQuery, [form_id, response_id, user_id]);

    if (permissionResult.rowCount === 0) {
      throw new HttpError(
        "Unauthorized to update this response or response not found.",
        403
      );
    }

    const { created_at, update_window_hours } = permissionResult.rows[0];
    const currentTime = new Date();
    const responseCreateTime = new Date(created_at);
    const expiryTime = new Date(
      responseCreateTime.getTime() + update_window_hours * 3600000
    );

    if (currentTime > expiryTime) {
      throw new HttpError(
        "The time window for updating this response has expired.",
        403
      );
    }

    // Update answers within the response
    for (const [question_id, answer_details] of Object.entries(answers)) {
      const updateAnswerQuery = `
          UPDATE answers
          SET value = $1, score = $2, feedback = $3
          WHERE response_id = $4 AND question_id = $5;
        `;
      const score = answer_details.grade ? answer_details.grade.score : 0;
      const feedback = answer_details.grade
        ? JSON.stringify(answer_details.grade.feedback)
        : null;
      const answer_value = answer_details.text_answers
        ? JSON.stringify(answer_details.text_answers.answers)
        : "{}";

      await pool.query(updateAnswerQuery, [
        answer_value,
        score,
        feedback,
        response_id,
        question_id,
      ]);
    }

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Response updated successfully.",
    });
}catch(err){

  await pool.query("ROLLBACK");
  next(err)
}




    
  })
);


export default router;
