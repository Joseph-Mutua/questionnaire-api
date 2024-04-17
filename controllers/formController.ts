import { Response, Request } from "express";
import { pool } from "../config/db";
import { Form } from "../types";

export type UserRequest = Request & { user?: { userId: string } };

export const createForm = async (req: UserRequest, res: Response) => {
  const userId = req.user?.userId;

  const { info, settings, sections }: Form = req.body;

  if (!userId) {
    return res.status(403).json({ error: "User Must Be Logged In." });
  }

  try {
    await pool.query("BEGIN");
    const formInfoQuery =
      "INSERT INTO formInfo(title, description) VALUES($1, $2) RETURNING infoId";

    const formInfoValues = [
      info.title,
      info.description || "No description provided",
    ];

    const formInfoResult = await pool.query(formInfoQuery, formInfoValues);
    const quizSettingsQuery =
      "INSERT INTO quizSettings(isQuiz) VALUES($1) RETURNING quizSettingsId";

    const quizSettingsValues = [settings.isQuiz];
    const quizSettingsResult = await pool.query(
      quizSettingsQuery,
      quizSettingsValues
    );

    const formSettingsQuery =
      "INSERT INTO formSettings(quizSettingsId) VALUES($1) RETURNING settingsId";
    const formSettingsValues = [quizSettingsResult.rows[0].quizSettingsId];
    const formSettingsResult = await pool.query(
      formSettingsQuery,
      formSettingsValues
    );

    const formsQuery =
      "INSERT INTO forms(ownerId, infoId, revisionId, responderUri, settingsId) VALUES($1, $2, 'v1.0', '', $3) RETURNING formId";
    const formsValues = [
      userId,
      formInfoResult.rows[0].infoid,
      formSettingsResult.rows[0].settingsid,
    ];
    const formResult = await pool.query(formsQuery, formsValues);

    if (sections && sections.length > 0) {
      for (const section of sections) {
        const sectionQuery =
          "INSERT INTO sections(formId, title, description, seqOrder) VALUES($1, $2, $3, $4)";

        const sectionValues = [
          formResult.rows[0].formId,
          section.title,
          section.description || "No description",
          section.seqOrder,
        ];

        await pool.query(sectionQuery, sectionValues);
      }
    }

    await pool.query("COMMIT");
    res.status(201).json({
      message: "Form created successfully",
      formId: formResult.rows[0].formId,
    });

  } catch (error) {

    await pool.query("ROLLBACK");
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
    
  }
};
