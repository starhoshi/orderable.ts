import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Event, TriggerAnnotated } from 'firebase-functions'
import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import { Pring, property } from 'pring'
import * as Retrycf from 'retrycf'
import * as Flow from '@1amageek/flow'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import * as request from 'request'
import * as Slack from 'slack-node'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'
import { PringUtil } from './util'
import { BadRequestError, BaseError, ErrorType, OrderableError, RetryFailedError, StripeError, StripeErrorType, ValidationErrorType } from './error'
import { OrderPaymentStatus, OrderProtocol, OrderShopPaymentStatus, OrderShopProtocol, OrderSKUProtocol, ProductProtocol, ShopProtocol, SKUProtocol, StockType, StripeProtocol, UserProtocol } from './protocol'

export * from './util'
export * from './error'
export * from './protocol'
export * from './function'

export let stripe: Stripe
export let firestore: FirebaseFirestore.Firestore
let adminOptions: any

export const initialize = (options: { adminOptions: any, stripeToken: string}) => {
  Pring.initialize(options.adminOptions)
  Retrycf.initialize(options.adminOptions)
  Mission.initialize(options.adminOptions)
  EventResponse.initialize(options.adminOptions)
  EventResponse.configure({ collectionPath: 'version/1/failure' })
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  stripe = new Stripe(options.stripeToken)
  adminOptions = options.adminOptions
}
