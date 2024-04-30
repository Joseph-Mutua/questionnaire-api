/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

import asyncErrorHandler from "../../middleware/asyncErrorHandler";

const router = Router();


//Form owner route for fetching form
router.get(
  "/:id",
  authenticateUser,
  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
    const form_id = parseInt(req.params.id);
    if (!form_id) {
      throw new HttpError("Invalid form ID provided.", 400);
    }
    const form_details = await fetchFormDetails(pool, form_id);
    if (!form_details) {
      throw new HttpError("Form not found.", 404);
    }
    res.json(form_details);
  })
);

export default router;