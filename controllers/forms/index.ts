import { Router } from "express";
import createNewForm from "./createNewForm";
import getForm from "./getForm";
import deleteForm from "./deleteForm";
import getAllFormResponse from "./getAllFormResponse";
import getFormByToken from "./getFormByToken";
import getFormResponseByToken from "./getFormResponseByToken";
import getSpecificFormResponse from "./getSpecificFormResponse";
import revertFormVersion from "./revertFormVersion";
import submitFormResponse from "./submitFormResponse";
import updateForm from "./updateForm";


const router = Router();

router.use(createNewForm);
router.use(getForm);
router.use(deleteForm);
router.use(getAllFormResponse);
router.use(getFormByToken);
router.use(getFormResponseByToken);
router.use(getSpecificFormResponse);
router.use(revertFormVersion);
router.use(submitFormResponse);
router.use(updateForm);


export default router;