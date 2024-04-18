import { Response, Request } from "express";
import { pool } from "../config/db";
import { QuizSettings, Section } from "../types";

export type UserRequest = Request & { user?: { userId: string } };

export const createForm = async (req: UserRequest, res: Response) => {
  const userId = req.user?.userId;
  const { title } = req.body;

  if (!userId) {
    return res.status(403).json({ error: "User must be logged in." });
  }
  try {
    await pool.query("BEGIN");

    const formInfoQuery =
      "INSERT INTO formInfo(title, description) VALUES($1, $2) RETURNING infoId";
    const formInfoValues = [title, ""];
    const formInfoResult = await pool.query(formInfoQuery, formInfoValues);

    const formsQuery =
      "INSERT INTO forms(ownerId, infoId, revisionId, u, settingsId) VALUES($1, $2, 'v1.0', '', $3) RETURNING formId";
    const formsValues = [userId, formInfoResult.rows[0].infoid, null];
    const formResult = await pool.query(formsQuery, formsValues);

    await pool.query("COMMIT");
    res.status(201).json({
      message: "Form created successfully",
      formId: formResult.rows[0].formid,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const updateForm = async (req: UserRequest, res: Response) => {
  const userId = req.user?.userId;
  const formId = parseInt(req.params.id);
  const {
    sections,
    settings,
  }: { sections: Section[]; settings?: QuizSettings } = req.body;

  if (!userId) {
    return res.status(403).json({ error: "User must be logged in." });
  }
  if (!formId) {
    return res.status(400).json({ error: "Invalid form ID." });
  }

  try {
    await pool.query("BEGIN");

    if (settings) {
      const quizSettingsQuery =
        "INSERT INTO quizSettings(isQuiz) VALUES ($1) RETURNING quizSettingsId";
      const quizSettingsResult = await pool.query(quizSettingsQuery, [
        settings.isQuiz,
      ]);

      const formSettingsQuery =
        "UPDATE formSettings SET quizSettingsId = $1 WHERE settingsId = (SELECT settingsId FROM forms WHERE formId = $2)";
      await pool.query(formSettingsQuery, [
        quizSettingsResult.rows[0].quizsettingsid,
        formId,
      ]);
    }

    for (const section of sections) {
      const sectionQuery =
        "INSERT INTO sections(formId, title, description, seqOrder) VALUES($1, $2, $3, $4) RETURNING sectionId";
      const sectionValues = [
        formId,
        section.title,
        section.description,
        section.seqOrder,
      ];
      const sectionResult = await pool.query(sectionQuery, sectionValues);

      if (sectionResult.rows.length === 0) {
        throw new Error("Failed to insert section, no section ID returned.");
      }

      const sectionId = sectionResult.rows[0].sectionid;

      for (const item of section.items) {
        const itemQuery =
          "INSERT INTO items(formId,  title, description, kind) VALUES($1, $2, $3, $4) RETURNING itemId";
        const itemValues = [formId, item.title, item.description, item.kind];
        const itemResult = await pool.query(itemQuery, itemValues);

        if (itemResult.rows.length === 0) {
          throw new Error("Failed to insert item, no item ID returned.");
        }

        if (item.kind === "questionItem" && item.question) {
          const questionQuery =
            "INSERT INTO questions( required, kind) VALUES($1, $2) RETURNING questionId";
          const questionValues = [item.question.required, item.question.kind];
          const questionResult = await pool.query(
            questionQuery,
            questionValues
          );

          if (questionResult.rows.length === 0) {
            throw new Error(
              "Failed to insert question, no question ID returned."
            );
          }

          const questionItemQuery =
            "INSERT INTO questionItems(itemId) VALUES($1)";
          await pool.query(questionItemQuery, [itemResult.rows[0].itemid]);
        }
      }
    }

    await pool.query("COMMIT");

    res.status(200).json({
      message: "Form updated successfully",
      formId: formId
      //form: completeFormResult.rows[0],
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form update:", error);
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};
