import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as Retrycf from 'retrycf'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { Pring, property } from 'pring'
import * as Model from './sampleModel'
import * as Orderable from './orderable.develop'
// import * as Orderable from '@star__hoshi/orderable'

admin.initializeApp(<admin.AppOptions>functions.config().firebase)
Pring.initialize(functions.config().firebase)
Orderable.initialize({
  adminOptions: functions.config().firebase,
  stripeToken: functions.config().stripe.token
})

export const paySampleOrder = functions.firestore
  .document(`${Model.SampleOrder.getPath()}/{orderID}`)
  .onUpdate(async (event) =>  {
    const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
      order: Model.SampleOrder,
      shop: Model.SampleShop,
      user: Model.SampleUser,
      sku: Model.SampleSKU,
      product: Model.SampleProduct,
      orderShop: Model.SampleOrderShop,
      orderSKU: Model.SampleOrderSKU
    })

    return Orderable.Functions.orderPaymentRequested(orderObject)
  })
