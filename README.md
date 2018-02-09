
<p align="center">
    <img src="https://raw.githubusercontent.com/starhoshi/orderable.ts/master/docs/logo.png" width='180px' />
</p>

# orderable.ts

<b>⚠️ Orderable is currently under development. ⚠️</b>

for japanese: [README\.ja\.md](https://github.com/starhoshi/orderable.ts/blob/master/README.ja.md)

orderable.ts is an npm library that works with Cloud Functions for Firebase and can easily execute payment.  
EC requires a lot of processing. For example, check number of stocks, payment process, create history, and so on. orderable.ts exec these troublesome tasks.

For Client Side (iOS): [starhoshi/Orderable](https://github.com/starhoshi/Orderable)

## Installation

* Required
  * [Yarn](https://yarnpkg.com/ja/)
    * If use npm, the dependency can not be resolved and an error will result.
  * TypeScript
    * Necessary to define the model.

```
yarn add @star__hoshi/orderable pring
yarn add typescript --dev
```

## Settings

Sample function is [orderable\.ts/index\.ts](https://github.com/starhoshi/orderable.ts/blob/master/sample-cloud-functions/functions/src/index.ts). Please refer to it.

### tsconfig.json

orderable.ts depends on [1amageek/pring\.ts](https://github.com/1amageek/pring.ts). So, set `experimentalDecorators` to` true`.

```json
{
    "compilerOptions": {
        "target": "es2017",
        "lib": ["es2017"],
        "module": "commonjs",
        "experimentalDecorators": true,
        "sourceMap": true
    }
}
```

## Usage

### 1. Initialize

Initialize orderable.ts and pring.ts in your index.ts.

```ts
import * as Orderable from '@star__hoshi/orderable'
import { Pring } from 'pring'

Pring.initialize(functions.config().firebase)
Orderable.initialize({
  adminOptions: functions.config().firebase,
  stripeToken: 'YOUR_STRIPE_TOKEN_IF_NEEDED',
  slack: undefined // OR {url: "YOUR_SLACK_URL", channel: 'CHANNEL_NAME'}
})
```

### 2. Model definition

You need to define the necessary Model in your project.

The required interface is [here](https://github.com/starhoshi/orderable.ts/blob/master/orderable/src/orderable.ts#L118-L194), the sample model definition is [here](https://github.com/starhoshi/orderable.ts/blob/master/sample-cloud-functions/functions/src/sampleModel.ts).

* User
  * Buyer
* Shop
  * Seller
* Product
  * Product concept.
* SKU
  * Entity of the product. Have inventory and price etc.
* Order
  * Order have payment amount and payment method etc.
* OrderShop
  * Order information for each shop.
* OrderSKU
  * The item ordered. Have quantity etc.

### 3. Cloud Functions

Initialize orderObject and execute orderPaymentRequested as follows.

```ts
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
    
    try {
      Orderable.Functions.orderPaymentRequested(orderObject)
    } catch (e) {
      console.error(e)
    }
  })
```

deploy:

```sh
firebase deploy --only functions:paySampleOrder
```

### 4. Start payment trigger

`Orderable.Functions.orderPaymentRequested(orderObject)` will start when order.paymentStatus becomes PaymentRequested.

```ts
order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
await order.update()
```

### 5. Result

When purchase processing is completed, `order.neoTask.status === 1` will be set. That is a sign of success.

```ts
if (order.neoTask && order.neoTask.status === 1) {
  // payment completed
}
```

Also, the status of Order and OrderShop will be changed as follows.

* Order
    * paymentStatus === 4 (Orderable.OrderPaymentStatus.Paid)
* OrderShop[]
    * paymentStatus === 3 (Orderable.OrderShopPaymentStatus.Paid)

## Error

### NeoTask

If the function fails, `order.neoTask.status === 2` will be set. And detailed error data will be set in neoTask.

#### NeoTask.invalid

This error occurs when you need to modify order information.For example, when the credit card is invalid, out of stock, etc.

You must change your credit card, change skus you order, etc.

```ts
export enum ValidationErrorType {
  ShopIsNotActive = 'ShopIsNotActive',
  SKUIsNotActive = 'SKUIsNotActive',
  OutOfStock = 'OutOfStock',
  StripeCardError = 'StripeCardError',
  StripeInvalidRequestError = 'StripeInvalidRequestError',
  StripeCardExpired = 'StripeCardExpired',
  PaymentInfoNotFound = 'PaymentInfoNotFound'
}
```

Please set the necessary conditions again and execute the trigger of `4. Start payment` again. In some cases it may be better to recreate the Order.

#### NeoTask.fatal

This error will be set when an unrecoverable problem occurs. For example, when saving payment completion data failed, etc.

In this case retry can not solve it, so you have to check and correct the data directly.

#### NeoTask.retry

This state can be solved by re-running Cloud Functions.
In this case, __Orderable automatically__ retries the function.

If retry can not be solved twice, a fatal error will be set. If it succeeds, `neoTask.status === 1`.  
As soon as it changes to fatal or success, please wait for it.

### FlowError

If processing fails, you can catch an Error of type FlowError. FlowError has an error, you can handle error handling as well.

```ts
    try {
      Orderable.Functions.orderPaymentRequested(event, orderObject)
    } catch (e) {
      console.error(e)
      if (e.constructor === Orderable.FlowError) {
        console.log(e.step)
        if (e.error.constructor === Orderable.StripeError) {
          // post to slack ...
        }
      }
    }
```

## Q & A

### What happens if Cloud Functions fire multiple times?

> Note: Trigger events are delivered at least once, which means that rarely, spurious duplicates may occur.
> https://cloud.google.com/functions/docs/concepts/events-triggers#triggers

Cloud Functions rarely fire multiple times.  
The stock will be reduced more, and __multiple payout__ will occur.

We use transactions to prevent it. Once Orderable is started, save the flag in `neoTask.completed`. And if the flag is already true, Orderable will stop.
https://github.com/starhoshi/orderable.ts/blob/master/orderable/src/orderable.ts#L433-L434
