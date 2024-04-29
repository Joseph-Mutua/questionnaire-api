import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import HttpError from "../utils/httpError";

const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = "Something went wrong";

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  console.error(err);

  res.status(statusCode).json({ error: message });
};

export default errorHandler; 