import * as EventResponse from 'event-response'
import * as Retrycf from 'retrycf'
import { OrderProtocol } from './orderable'

export enum ValidationErrorType {
  ShopIsNotActive = 'ShopIsNotActive',
  SKUIsNotActive = 'SKUIsNotActive',
  OutOfStock = 'OutOfStock',
  StripeCardError = 'StripeCardError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  StripeCardExpired = 'StripeCardExpired',
  PaymentInfoNotFound = 'PaymentInfoNotFound'
}

export class BaseError extends Error {
  id: string
  name: string
  message: string
  stack?: string

  constructor(id: string, message: string) {
    super(message)

    Object.defineProperty(this, 'id', {
      get: () => id
    })

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error()).stack
    }
  }

  toString() {
    return this.name + ': ' + this.id + ': ' + this.message
  }
}

export class BadRequestError extends BaseError {
  name: 'BadRequestError'

  constructor(id: string, message: string) {
    super(id, message)
  }
}

export class RetryFailedError extends BaseError {
  name: 'RetryFailedError'

  constructor(id: string, message: string) {
    super(id, message)
  }
}

export enum ErrorType {
  Retry = 'Retry',
  Completed = 'Completed',
  BadRequest = 'BadRequest',
  Internal = 'Internal'
}

export class OrderableError extends Error {
  step: string
  type: ErrorType
  error: Error

  constructor(step: string, errorType: ErrorType, error: Error) {
    super(`An error occurred in step: ${step}`)

    this.error = error

    Object.defineProperty(this, 'step', {
      get: () => step
    })

    Object.defineProperty(this, 'type', {
      get: () => errorType
    })

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error()).stack
    }
  }
}

export enum StripeErrorType {
  StripeCardError = 'StripeCardError',
  RateLimitError = 'RateLimitError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  // An error occurred internally with Stripe's API
  StripeAPIError = 'StripeAPIError',
  StripeConnectionError = 'StripeConnectionError',
  StripeAuthenticationError = 'StripeAuthenticationError',
  UnexpectedError = 'UnexpectedError'
}

export class StripeError extends Error {
  type: StripeErrorType
  message: string
  statusCode: number
  requestId: string
  error: any

  constructor(error: any) {
    super()

    if (!error.type) {
      console.error(error)
      throw 'unexpected stripe error'
    }

    this.error = error
    this.message = error.message
    this.statusCode = error.statusCode
    this.requestId = error.requestId

    switch (error.type) {
      case 'StripeCardError':
        this.type = StripeErrorType.StripeCardError
        break
      case 'RateLimitError':
        this.type = StripeErrorType.RateLimitError
        break
      case 'StripeInvalidRequestError':
        this.type = StripeErrorType.StripeInvalidRequestError
        break
      case 'StripeAPIError':
        this.type = StripeErrorType.StripeAPIError
        break
      case 'StripeConnectionError':
        this.type = StripeErrorType.StripeConnectionError
        break
      case 'StripeAuthenticationError':
        this.type = StripeErrorType.StripeAuthenticationError
        break
      default:
        this.type = StripeErrorType.UnexpectedError
        break
    }
  }

  async setError<T extends OrderProtocol>(model: T, step: string) {
    let errorType: ErrorType = ErrorType.Internal
    switch (this.type) {
      // validate
      case StripeErrorType.StripeCardError: {
        errorType = ErrorType.BadRequest
        model.result = await new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeCardError, `${this.type}: ${this.message}`)
        break
      }
      case StripeErrorType.StripeInvalidRequestError: {
        errorType = ErrorType.BadRequest
        model.result = await new EventResponse.Result(model.reference).setBadRequest(ValidationErrorType.StripeInvalidRequestError, `${this.type}: ${this.message}`)
        break
      }

      // retry
      case StripeErrorType.StripeAPIError:
      case StripeErrorType.StripeConnectionError:
        errorType = ErrorType.Retry
        model.retry = await Retrycf.setRetry(model.reference, model.rawValue(), Error(`${this.type}: ${this.message}`))
        break

      // fatal
      case StripeErrorType.RateLimitError:
      case StripeErrorType.StripeAuthenticationError:
      case StripeErrorType.UnexpectedError:
        errorType = ErrorType.Internal
        model.result = await new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`)
        break

      default:
        errorType = ErrorType.Internal
        model.result = await new EventResponse.Result(model.reference).setInternalError(step, `${this.type}: ${this.message}`)
        break
    }
    return errorType
  }
}