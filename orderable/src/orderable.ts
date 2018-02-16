import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import { Pring } from 'pring'
import * as Retrycf from 'retrycf'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'

export * from './util'
export * from './error'
export * from './protocol'
export * from './function'

export let stripe: Stripe
export let firestore: FirebaseFirestore.Firestore

export const initialize = (options: { adminOptions: any, stripeToken: string}) => {
  Pring.initialize(options.adminOptions)
  Retrycf.initialize(options.adminOptions)
  Mission.initialize(options.adminOptions)
  EventResponse.initialize(options.adminOptions)
  EventResponse.configure({ collectionPath: 'version/1/failure' })
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  stripe = new Stripe(options.stripeToken)
}
