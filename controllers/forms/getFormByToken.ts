/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

const router = Router();

//Public route for accessing form
router.get(
  "/respond",

  async (req: Request, res: Response) => {
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

    const { form_id } = decoded as {
      form_id: number;
      revisionId: string;
    };

    const form_details = await fetchFormDetails(pool, form_id);
    if (!form_details) {
      throw new HttpError("Form not found or revision does not match.", 404);
    }

    res.json(form_details);
  }
  
);

export default router;
