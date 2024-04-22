import { Router } from "express";
import {
  createForm,
  deleteForm,
  getForm,
  getFormByToken,
  getFormsByUser,
  getSpecificFormResponse,
  submitFormResponse,
  updateForm,
} from "../controllers/formController";
import { authenticateUser } from "../middleware/auth";

const router = Router();

// Creation and Update
router.post("/", authenticateUser, createForm);
router.patch("/:id", authenticateUser, updateForm);

// Specific static route for token-based access
router.get("/respond", getFormByToken);

//Get Specific Form Response
router.get(":formId/responses/:responseId", getSpecificFormResponse);


// Standard ID-based retrieval and deletion
router.get("/:id", authenticateUser, getForm);
router.delete("/:id", authenticateUser, deleteForm);

// Handling responses
router.post("/:formId/responses", submitFormResponse);

export default router;
