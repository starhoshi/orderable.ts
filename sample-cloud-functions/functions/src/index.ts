import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Retrycf } from 'retrycf'
// import { INeoTask, NeoTask } from '../../../retrycf/src/retrycf'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { Pring } from 'pring'
import * as Orderable from '@star__hoshi/orderable'

admin.initializeApp(<admin.AppOptions>functions.config().firebase)
Pring.initialize(functions.config().firebase)
Retrycf.initialize(functions.config().firebase)
Orderable.initialize({
  adminOptions: functions.config().firebase,
  stripeToken: functions.config().stripe.token,
  slack: { url: functions.config().slack.url, channel: '#komerco-error' }
})
console.log(functions.config())

// export const orderablePayOrder = Orderable.Functions.orderPaymentRequested
export const orderablePayOrder = functions.firestore
  .document('version/1/order/{orderID}')
  .onUpdate(event => {
    return Orderable.Functions.orderPaymentRequested(event)
  })

exports.updateUser = functions.firestore
  .document('version/1/users/{userId}')
  .onCreate(event => {
    // Get an object representing the document
    // e.g. {'name': 'Marie', 'age': 66}
    var newValue = event.data.data();

    const aaa = new Orderable.Model.Product()
    aaa.save()

    // ...or the previous value before this update
    var previousValue = event.data.previous.data();

    // access a particular field as you would any JS property
    var name = newValue.name;

    // perform desired operations ...
});