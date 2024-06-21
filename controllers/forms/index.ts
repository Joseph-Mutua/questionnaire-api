import { Router } from "express";
import createNewForm from "./createNewForm";
import getForm from "./getForm";
import deleteForm from "./deleteForm";
import getFormByToken from "./getFormByToken";
import setActiveFormVersion from "./setActiveFormVersion";
import updateForm from "./updateForm";
import generateSharingLink from "./generateSharingLink";
import submitFormResponse from "./submitFormResponse";
import getFormResponseByToken from "./getFormResponseByToken";
import getAllFormResponses from "./getAllFormResponses";
//import createFormFromTemplate from "./createFormFromTemplate";



const router = Router();

router.use(createNewForm);
//router.use(createFormFromTemplate)
router.use(getFormByToken);
router.use(getForm);
router.use(deleteForm);

router.use(updateForm);
router.use(setActiveFormVersion);
router.use(generateSharingLink);

router.use(submitFormResponse);
router.use(getFormResponseByToken);
router.use(getAllFormResponses);




export default router;
