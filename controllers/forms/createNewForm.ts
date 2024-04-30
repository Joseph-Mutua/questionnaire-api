/* eslint-disable @typescript-eslint/no-misused-promises */

import { Router, Response } from "express";
import { AuthRequest, authenticateUser } from "../../middleware/auth";
import HttpError from "../../utils/httpError";
import { pool } from "../../config/db";
import jwt from "jsonwebtoken";

import { fetchFormDetails } from "../../helpers/forms/formControllerHelpers";

import asyncErrorHandler from "../../middleware/asyncErrorHandler";

const router = Router();

// Routes for form management
router.post(
  "/",
  authenticateUser,
  asyncErrorHandler(async (req: AuthRequest, res: Response) => {
    const user_id = req.user?.user_id;
    const { title, description } = req.body as {
      title: string;
      description: string;
    };

    if (!user_id) {
      throw new HttpError("User must be logged in.", 403);
    }

    await pool.query("BEGIN");
    const form_info_query =
      "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";
    const form_info_values = [title, description];
    const form_info_result = await pool.query<{ info_id: number }>(
      form_info_query,
      form_info_values
    );
    const revisionId = "v1.0";
    const token = jwt.sign(
      {
        form_id: form_info_result.rows[0].info_id,
        permissions: "fill",
        revisionId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "3d" }
    );
    const responderUri = `${process.env.APP_DOMAIN_NAME}/api/v1/forms/respond?token=${token}`;
    const forms_query =
      "INSERT INTO forms(owner_id, info_id, revision_id, responder_uri) VALUES($1, $2, $3, $4) RETURNING form_id";
    const forms_values = [
      user_id,
      form_info_result.rows[0].info_id,
      revisionId,
      responderUri,
    ];
    const forms_result = await pool.query<{ form_id: number }>(
      forms_query,
      forms_values
    );
    const form_id = forms_result.rows[0].form_id;
    const initSettingsQuery =
      "INSERT INTO form_settings(quiz_settings_id, update_window_hours, wants_email_updates) VALUES(NULL, 24, FALSE) RETURNING settings_id";
    const settingsResult = await pool.query<{ settings_id: number }>(
      initSettingsQuery
    );
    const settings_id = settingsResult.rows[0].settings_id;
    await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
      settings_id,
      form_id,
    ]);
    await pool.query("COMMIT");
    res.status(201).json({
      message: "Form created successfully",
      form_id: form_id,
      form_details: await fetchFormDetails(pool, form_id),
    });
  })
);

export default router;