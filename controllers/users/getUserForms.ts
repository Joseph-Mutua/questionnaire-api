import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";

import { pool } from "../../config/db";
import HttpError from "../../utils/httpError";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";
import asyncHandler from "../../utils/asyncHandler";

const router = Router();

router.get(
  "/:user_id/forms",
  asyncHandler(authenticateUser),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    const basicFormsQuery = "SELECT form_id FROM forms WHERE owner_id = $1";
    const basicFormsResult = await pool.query<{ form_id: number }>(
      basicFormsQuery,
      [user_id]
    );

    const formsDetailsPromises = basicFormsResult.rows.map((row) =>
      fetchFormDetails(pool, row.form_id)
    );
    const formsDetails = await Promise.all(formsDetailsPromises);

    res.json(formsDetails);
  })
);

export default router;
