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

// Routes for form management
router
  .route("/")
  .post(authenticateUser, createForm)
  .get(authenticateUser, getForm);

//Public route for accessing form
router.get("/respond", getFormByToken);

router
  .route("/:id")
  .get(authenticateUser, getForm)
  .patch(authenticateUser, updateForm)
  .delete(authenticateUser, deleteForm);


// Routes for form responses
router
  .route("/:formId/responses")
  .get(authenticateUser, getAllFormResponses)
  .post(submitFormResponse);

router.get("/:formId/responses/:responseId", getSpecificFormResponse);

export default router;