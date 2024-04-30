/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";


import asyncErrorHandler from "../../middleware/asyncErrorHandler";


const router = Router();


//Public route for accessing form
router.get(
  "/respond",

  asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.query.token) {
      throw new HttpError("Token is required", 400);
    }

    const token = typeof req.query.token === "string" ? req.query.token : null;

    if (!token) {
      throw new HttpError("Token must be a single string", 400);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (
      typeof decoded !== "object" ||
      !decoded.form_id ||
      !decoded.revisionId
    ) {
      throw new HttpError("Invalid token", 400);
    }

    const { form_id, revisionId } = decoded as {
      form_id: number;
      revisionId: string;
    };

    const form_details = await fetchFormDetails(pool, form_id, revisionId);
    if (!form_details) {
      throw new HttpError("Form not found or revision does not match.", 404);
    }

    res.json(form_details);
  })
);

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