"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.createForm = void 0;
const db_1 = require("../config/db");
const createForm = (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId =
      (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { info, settings, sections } = req.body;
    if (!userId) {
      return res.status(403).json({ error: "User Must Be Logged In." });
    }
    try {
      yield db_1.pool.query("BEGIN");
      const formInfoQuery =
        "INSERT INTO formInfo(title, description) VALUES($1, $2, $3) RETURNING infoId";
      const formInfoValues = [
        info.title,
        info.description || "No description provided",
      ];
      const formInfoResult = yield db_1.pool.query(
        formInfoQuery,
        formInfoValues
      );
      const quizSettingsQuery =
        "INSERT INTO quizSettings(isQuiz) VALUES($1) RETURNING quizSettingsId";
      const quizSettingsValues = [settings.isQuiz];
      const quizSettingsResult = yield db_1.pool.query(
        quizSettingsQuery,
        quizSettingsValues
      );
      const formSettingsQuery =
        "INSERT INTO formSettings(quizSettingsId) VALUES($1) RETURNING settingsId";
      const formSettingsValues = [quizSettingsResult.rows[0].quizSettingsId];
      const formSettingsResult = yield db_1.pool.query(
        formSettingsQuery,
        formSettingsValues
      );
      const formsQuery =
        "INSERT INTO forms(ownerId, infoId, revisionId, responderUri, settingsId) VALUES($1, $2, 'v1.0', '', $3) RETURNING formId";
      const formsValues = [
        userId,
        formInfoResult.rows[0].infoId,
        formSettingsResult.rows[0].settingsId,
      ];
      const formResult = yield db_1.pool.query(formsQuery, formsValues);
      if (sections && sections.length > 0) {
        for (const section of sections) {
          const sectionQuery =
            "INSERT INTO sections(formId, title, description, seq_order) VALUES($1, $2, $3, $4)";
          const sectionValues = [
            formResult.rows[0].formId,
            section.title,
            section.description || "No description",
            section.seq_order,
          ];
          yield db_1.pool.query(sectionQuery, sectionValues);
        }
      }
      yield db_1.pool.query("COMMIT");
      res.status(201).json({
        message: "Form created successfully",
        formId: formResult.rows[0].formId,
      });
    } catch (error) {
      yield db_1.pool.query("ROLLBACK");
      const errorMessage = error.message;
      res.status(500).send(errorMessage);
    }
  });
exports.createForm = createForm;
