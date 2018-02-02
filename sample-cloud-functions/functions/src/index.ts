import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Retrycf } from 'retrycf'
import * as Orderable from './orderable'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { Pring, property } from 'pring'
import * as Model from './sampleModel'
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
export const paySampleOrder = functions.firestore
  .document(`${Model.SampleOrder.getPath()}/{orderID}`)
  .onUpdate(async (event) =>  {
    const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderSKU>(event, {
      order: Model.SampleOrder,
      shop: Model.SampleShop,
      user: Model.SampleUser,
      sku: Model.SampleSKU,
      product: Model.SampleProduct,
      orderSKU: Model.SampleOrderSKU
    })

    // const order = await Model.Order.get(orderObject.orderID)
    // const shops = await OrderObject.fetchShopsFrom(orderSKUObjects)
    // TODO if stripe
    // const stripeCard = await stripe.customers.retrieveCard(order.stripe!.customerID!, order.stripe!.cardID!)

    // orderObject.orderSKUObjects = orderSKUObjects
    // orderObject.shops = shops
    // orderObject.stripeCard = stripeCard

    // const a = orderObject.associatedType.order.get(orderObject.orderID)

    // admin.firestore().collection(orderObject.associatedType.order.getCollectionPath()).doc(orderObject.orderID).get().then(s => {
    //   // orderObject.orderType2 = orderObject.orderType
    //   let order = orderObject.associatedType.order
    //   order.init(s)
    //   console.log(order)
    // })
    return Orderable.Functions.orderPaymentRequested(event, orderObject)
  })
