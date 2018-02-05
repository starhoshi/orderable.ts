import 'jest'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Pring } from 'pring'
import * as Orderable from '../orderable'
import * as Model from './sampleModel'
import { DeltaDocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { FirebaseHelper } from './firebaseHelper'

beforeAll(() => {
  const _ = FirebaseHelper.shared
})

it('test', async () => {
  jest.setTimeout(20000)

  const oldOrder = await FirebaseHelper.makeOrder()
  const newOrder = oldOrder.rawValue()
  newOrder.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested

  const event: functions.Event<DeltaDocumentSnapshot> = {
    params: { orderID: oldOrder.id },
    data: {
      exists: true,
      ref: oldOrder.reference,
      id: '',
      createTime: '',
      updateTime: '',
      readTime: '',
      previous: { data: () => { return oldOrder.rawValue() } },
      data: () => { return newOrder },
      get: (key: string) => { return undefined }
    }
  }

  const orderObject = new Orderable.Functions.OrderObject<Model.SampleOrder, Model.SampleShop, Model.SampleUser, Model.SampleSKU, Model.SampleProduct, Model.SampleOrderShop, Model.SampleOrderSKU>(event, {
    order: Model.SampleOrder,
    shop: Model.SampleShop,
    user: Model.SampleUser,
    sku: Model.SampleSKU,
    product: Model.SampleProduct,
    orderShop: Model.SampleOrderShop,
    orderSKU: Model.SampleOrderSKU
  })

  await Orderable.Functions.orderPaymentRequested(event, orderObject)
  expect(true)

})
