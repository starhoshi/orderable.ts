import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Retrycf } from 'retrycf'
import * as Orderable from './orderable'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { Pring, property } from 'pring'
// import * as Orderable from '@star__hoshi/orderable'

admin.initializeApp(<admin.AppOptions>functions.config().firebase)
Pring.initialize(functions.config().firebase)
Retrycf.initialize(functions.config().firebase)
Orderable.initialize({
  adminOptions: functions.config().firebase,
  stripeToken: functions.config().stripe.token,
  slack: undefined
})
console.log(functions.config())

// export const orderablePayOrder = Orderable.Functions.orderPaymentRequested
export const payOrder = functions.firestore
  .document('version/1/order/{orderID}')
  .onUpdate(event => {
    const orderObject = new Orderable.Functions.OrderObject2(event, Orderable.Model.Order)

    admin.firestore().collection(orderObject.orderType.getCollectionPath()).doc(orderObject.orderID).get().then(s => {
      orderObject.orderType2 = orderObject.orderType
      orderObject.orderType2.init(s)
      console.log(orderObject.orderType2)
    })
    return Orderable.Functions.orderPaymentRequested(event)
  })
