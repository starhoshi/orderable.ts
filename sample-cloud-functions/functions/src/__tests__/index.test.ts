import * as admin from 'firebase-admin'
import 'jest'
import * as Orderable from '@star__hoshi/orderable'
// import { Pring } from 'pring'

beforeAll(() => {
  const serviceAccount = require('../../sandbox-329fc-firebase-adminsdk.json')
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })

  // Pring.initialize({
  //   projectId: 'sandbox-329fc',
  //   keyFilename: './sandbox-329fc-firebase-adminsdk.json'
  // })

  Orderable.initialize({
    adminOptions: {
      projectId: 'sandbox-329fc',
      keyFilename: './sandbox-329fc-firebase-adminsdk.json'
    }, stripeToken: '', slack: { url: '', channel: '' }
  })
})

it('order create', async () => {
  // jest.setTimeout(1000000)

  // const skuData = [...Array(3).keys()].map(index => {
  //   return { price: 5000, stock: 1000, index: index }
  // })
  // const skus = await Promise.all(skuData.map(data => {
  //   return admin.firestore().collection('version/1/testsku').add(data)
  // }))

  // const testOrders = [...Array(5).keys()].map(a => {
  //   const testOrder: any = {}
  //   testOrder.orderSKUs = skus
  //   return testOrder
  // })

  // // await addOrdersPer02(testOrders)
  // await addOrdersAtOnce(testOrders)
  const aaa = new Orderable.Model.User()
  await aaa.save()

  expect(true)
})

const addOrdersAtOnce = async (testOrders: any[]) => {
  const testOrderColRef = admin.firestore().collection('version/1/testorder')
  const testOrderColRef2 = admin.firestore().collection('version/1/testorder2')

  await Promise.all(testOrders.map(async testOrder => {
    return testOrderColRef.add(testOrder)
  }))
  await Promise.all(testOrders.map(async testOrder => {
    return testOrderColRef2.add(testOrder)
  }))
}

const addOrdersPer02 = async (testOrders: any[]) => {
  const testOrderColRef = admin.firestore().collection('version/1/testorder')
  const testOrderColRef2 = admin.firestore().collection('version/1/testorder2')

  for (const testOrder of testOrders) {
    await sleep(0.2)
    await testOrderColRef.add(testOrder)
  }
  for (const testOrder of testOrders) {
    await sleep(0.2)
    await testOrderColRef2.add(testOrder)
  }
}

const sleep = (milliseconds: number) => {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), milliseconds)
  })
}
