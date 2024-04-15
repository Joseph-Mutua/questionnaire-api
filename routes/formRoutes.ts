import { Router } from "express";
import {
  getForms,
  createForm,
  updateForm,
  deleteForm,
} from "../controllers/formController";

const router = Router();

router.get("/", getForms);
router.post("/", createForm);
router.put("/:id", updateForm);
router.delete("/:id", deleteForm);

export default router;
