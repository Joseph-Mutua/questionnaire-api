import { Router } from "express";
import createNewForm from "./createNewForm";
import getForm from "./getForm";
import deleteForm from "./deleteForm";
import getFormByToken from "./getFormByToken";
import setActiveFormVersion from "./setActiveFormVersion";
import updateForm from "./updateForm";
import generateSharingLink from "./generateSharingLink";

import getFormResponseByToken from "../formResponses/getFormResponseByToken";
import getSpecificFormResponse from "../formResponses/getSpecificFormResponse";
import submitFormResponse from "../formResponses/submitFormResponse";
import getAllFormResponse from "../formResponses/getAllFormResponse";
import deleteFormResponse from "../formResponses/deleteFormResponse";

const router = Router();

router.use(createNewForm);
router.use(getFormByToken);
router.use(getForm);
router.use(deleteForm);
router.use(getAllFormResponse);
router.use(getFormResponseByToken);
router.use(getSpecificFormResponse);
router.use(submitFormResponse);
router.use(updateForm);
router.use(setActiveFormVersion);
router.use(generateSharingLink);


//Responses
router.use(deleteFormResponse);

export default router;
