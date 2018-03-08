"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const EventResponse = require("event-response");
const Retrycf = require("retrycf");
var ValidationErrorType;
(function (ValidationErrorType) {
    ValidationErrorType["ShopIsNotActive"] = "ShopIsNotActive";
    ValidationErrorType["SKUIsNotActive"] = "SKUIsNotActive";
    ValidationErrorType["OutOfStock"] = "OutOfStock";
    ValidationErrorType["StripeCardError"] = "StripeCardError";
    ValidationErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    ValidationErrorType["StripeCardExpired"] = "StripeCardExpired";
    ValidationErrorType["PaymentInfoNotFound"] = "PaymentInfoNotFound";
    ValidationErrorType["OrderExpired"] = "OrderExpired";
})(ValidationErrorType = exports.ValidationErrorType || (exports.ValidationErrorType = {}));
class BaseError extends Error {
    constructor(id, message) {
        super(message);
        Object.defineProperty(this, 'id', {
            get: () => id
        });
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error()).stack;
        }
    }
    toString() {
        return this.name + ': ' + this.id + ': ' + this.message;
    }
}
exports.BaseError = BaseError;
class BadRequestError extends BaseError {
    constructor(id, message) {
        super(id, message);
    }
}
exports.BadRequestError = BadRequestError;
class RetryFailedError extends BaseError {
    constructor(id, message) {
        super(id, message);
    }
}
exports.RetryFailedError = RetryFailedError;
var ErrorType;
(function (ErrorType) {
    ErrorType["Retry"] = "Retry";
    ErrorType["Completed"] = "Completed";
    ErrorType["BadRequest"] = "BadRequest";
    ErrorType["Internal"] = "Internal";
})(ErrorType = exports.ErrorType || (exports.ErrorType = {}));
class OrderableError extends Error {
    constructor(step, errorType, error) {
        super(`An error occurred in step: ${step}`);
        this.error = error;
        Object.defineProperty(this, 'step', {
            get: () => step
        });
        Object.defineProperty(this, 'type', {
            get: () => errorType
        });
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error()).stack;
        }
    }
}
exports.OrderableError = OrderableError;
var StripeErrorType;
(function (StripeErrorType) {
    StripeErrorType["StripeCardError"] = "StripeCardError";
    StripeErrorType["RateLimitError"] = "RateLimitError";
    StripeErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    // An error occurred internally with Stripe's API
    StripeErrorType["StripeAPIError"] = "StripeAPIError";
    StripeErrorType["StripeConnectionError"] = "StripeConnectionError";
    StripeErrorType["StripeAuthenticationError"] = "StripeAuthenticationError";
    StripeErrorType["UnexpectedError"] = "UnexpectedError";
})(StripeErrorType = exports.StripeErrorType || (exports.StripeErrorType = {}));
class StripeError extends Error {
    constructor(error) {
        super();
        if (!error.type) {
            console.error(error);
            throw 'unexpected stripe error';
        }
        this.error = error;
        this.message = error.message;
        this.statusCode = error.statusCode;
        this.requestId = error.requestId;
        switch (error.type) {
            case 'StripeCardError':
                this.type = StripeErrorType.StripeCardError;
                break;
            case 'RateLimitError':
                this.type = StripeErrorType.RateLimitError;
                break;
            case 'StripeInvalidRequestError':
                this.type = StripeErrorType.StripeInvalidRequestError;
                break;
            case 'StripeAPIError':
                this.type = StripeErrorType.StripeAPIError;
                break;
            case 'StripeConnectionError':
                this.type = StripeErrorType.StripeConnectionError;
                break;
            case 'StripeAuthenticationError':
                this.type = StripeErrorType.StripeAuthenticationError;
                break;
            default:
                this.type = StripeErrorType.UnexpectedError;
                break;
        }
    }
    setError(model, step) {
        return __awaiter(this, void 0, void 0, function* () {
            let errorType = ErrorType.Internal;
            switch (this.type) {
                // validate
                case StripeErrorType.StripeCardError: {
                    errorType = ErrorType.BadRequest;
                    model.data.result = yield new EventResponse.Result(model.ref).setBadRequest(ValidationErrorType.StripeCardError, `${this.type}: ${this.message}`);
                    break;
                }
                case StripeErrorType.StripeInvalidRequestError: {
                    errorType = ErrorType.BadRequest;
                    model.data.result = yield new EventResponse.Result(model.ref).setBadRequest(ValidationErrorType.StripeInvalidRequestError, `${this.type}: ${this.message}`);
                    break;
                }
                // retry
                case StripeErrorType.StripeAPIError:
                case StripeErrorType.StripeConnectionError:
                    errorType = ErrorType.Retry;
                    model.data.retry = yield Retrycf.setRetry(model.ref, model.data, Error(`${this.type}: ${this.message}`));
                    break;
                // fatal
                case StripeErrorType.RateLimitError:
                case StripeErrorType.StripeAuthenticationError:
                case StripeErrorType.UnexpectedError:
                    errorType = ErrorType.Internal;
                    model.data.result = yield new EventResponse.Result(model.ref).setInternalError(step, `${this.type}: ${this.message}`);
                    break;
                default:
                    errorType = ErrorType.Internal;
                    model.data.result = yield new EventResponse.Result(model.ref).setInternalError(step, `${this.type}: ${this.message}`);
                    break;
            }
            return errorType;
        });
    }
}
exports.StripeError = StripeError;
