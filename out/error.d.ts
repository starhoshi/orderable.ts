import { OrderProtocol } from './protocol';
export declare enum ValidationErrorType {
    ShopIsNotActive = "ShopIsNotActive",
    SKUIsNotActive = "SKUIsNotActive",
    OutOfStock = "OutOfStock",
    StripeCardError = "StripeCardError",
    StripeInvalidRequestError = "StripeInvalidRequestError",
    StripeCardExpired = "StripeCardExpired",
    PaymentInfoNotFound = "PaymentInfoNotFound",
}
export declare class BaseError extends Error {
    id: string;
    name: string;
    message: string;
    stack?: string;
    constructor(id: string, message: string);
    toString(): string;
}
export declare class BadRequestError extends BaseError {
    name: 'BadRequestError';
    constructor(id: string, message: string);
}
export declare class RetryFailedError extends BaseError {
    name: 'RetryFailedError';
    constructor(id: string, message: string);
}
export declare enum ErrorType {
    Retry = "Retry",
    Completed = "Completed",
    BadRequest = "BadRequest",
    Internal = "Internal",
}
export declare class OrderableError extends Error {
    step: string;
    type: ErrorType;
    error: Error;
    constructor(step: string, errorType: ErrorType, error: Error);
}
export declare enum StripeErrorType {
    StripeCardError = "StripeCardError",
    RateLimitError = "RateLimitError",
    StripeInvalidRequestError = "StripeInvalidRequestError",
    StripeAPIError = "StripeAPIError",
    StripeConnectionError = "StripeConnectionError",
    StripeAuthenticationError = "StripeAuthenticationError",
    UnexpectedError = "UnexpectedError",
}
export declare class StripeError extends Error {
    type: StripeErrorType;
    message: string;
    statusCode: number;
    requestId: string;
    error: any;
    constructor(error: any);
    setError<T extends OrderProtocol>(model: T, step: string): Promise<ErrorType.Retry | ErrorType.BadRequest | ErrorType.Internal>;
}
