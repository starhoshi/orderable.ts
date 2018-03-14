import * as FirebaseFirestore from '@google-cloud/firestore'
import * as Stripe from 'stripe'
import * as Retrycf from 'retrycf'
import * as Mission from 'mission-completed'
import * as EventResponse from 'event-response'
import * as Tart from '@star__hoshi/tart'

export * from './error'
export * from './protocol'
export * from './function'

export let stripe: Stripe
export let firestore: FirebaseFirestore.Firestore

export const initialize = (options: { adminOptions: any, stripeToken: string }) => {
  firestore = new FirebaseFirestore.Firestore(options.adminOptions)
  Tart.initialize(firestore)
  Retrycf.initialize(firestore)
  Mission.initialize(firestore)
  EventResponse.initialize(firestore)
  EventResponse.configure({ collectionPath: 'version/1/failure' })
  stripe = new Stripe(options.stripeToken)
}
