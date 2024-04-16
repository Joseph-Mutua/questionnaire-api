import { Request, Response, NextFunction } from "express";

type RequestHandler = (req: Request, res: Response, next: NextFunction) => any;

export const catchAsyncErrors =
  (theFunc: RequestHandler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(theFunc(req, res, next)).catch(next);
  };
