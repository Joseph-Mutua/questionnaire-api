import { Router } from "express";
import {
  createForm,
  deleteForm,
  getAllFormResponses,
  getForm,
  getFormByToken,
  getSpecificFormResponse,
  submitFormResponse,
  updateForm,
} from "../controllers/formController";
import { authenticateUser } from "../middleware/auth";

const router = Router();

router.post("/", authenticateUser, createForm);
router.patch("/:id", authenticateUser, updateForm);

router.get("/respond", getFormByToken);

router.get("/:formId/responses/:responseId", getSpecificFormResponse);
router.get("/:formId/responses", authenticateUser, getAllFormResponses);

router.get("/:id", authenticateUser, getForm);
router.delete("/:id", authenticateUser, deleteForm);

router.post("/:formId/responses", submitFormResponse);

export default router;
