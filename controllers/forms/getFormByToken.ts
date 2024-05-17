/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response, Request } from "express";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";
import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

const router = Router();

//Public route for accessing form
router.get("/respond", async (req: Request, res: Response) => {
  if (!req.query.token) {
    throw new HttpError("Token is required", 400);
  }
  const token = typeof req.query.token === "string" ? req.query.token : null;

  if (!token) {
    throw new HttpError("Token must be a single string", 400);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET!);
  if (typeof decoded !== "object" || !decoded.form_id || !decoded.version_id) {
    throw new HttpError("Invalid token", 400);
  }

  const { form_id, version_id } = decoded as {
    form_id: number;
    version_id: number;
  };

  const formDetails = await fetchFormDetails(pool, form_id, version_id);

  if (!formDetails) {
    return res.status(404).json({ message: "Form not found" });
  }

  res.status(200).json({
    message: "Form retrieved successfully.",
    form: formDetails,
  });
});

export default router;
