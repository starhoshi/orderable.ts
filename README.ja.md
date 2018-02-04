# orderable.ts

Orderable は Cloud Functions for Firebase と連携し、決済が簡単に実行できるライブラリです。  
在庫のチェック、購入処理、購入後の履歴作成などの EC に必要なことをやってくれます。

iOS 側は [starhoshi/Orderable](https://github.com/starhoshi/Orderable) を利用してください。

## Installation

yarn を使ってください。 npm では依存性の解決ができずエラーになります。  
また、 typescript を使うことを推奨します。

```
yarn add @star__hoshi/orderable
```

## Settings

### tsconfig.json

orderable では内部的に [1amageek/pring\.ts](https://github.com/1amageek/pring.ts) を使っています。  
そのため、 `experimentalDecorators` を `true` にしてください。

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

index.ts で Orderable を initialize してください。

```ts
import * as Orderable from '@star__hoshi/orderable'

Orderable.initialize({
  adminOptions: functions.config().firebase,
  stripeToken: 'YOUR_STRIPE_TOKEN_IF_NEEDED',
  slack: undefined
})
```

エラーが発生した時に Slack 通知が必要な場合:

```ts
Orderable.initialize({
    adminOptions: functions.config().firebase,
    stripeToken: functions.config().stripe.token,
    slack: {url: "YOUR_SLACK_URL", channel: 'CHANNEL_NAME'}
})
```

### 2. Model 定義

[orderable\.ts/sampleModel\.ts](https://github.com/starhoshi/orderable.ts/blob/master/sample-cloud-functions/functions/src/sampleModel.ts) を参考に、あなたのプロジェクトで必要な Model の定義をしてください。

### 3. Cloud Functions

2 で定義した Class を引数として渡してください。

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

    return Orderable.Functions.orderPaymentRequested(event, orderObject)
  })
```

deploy:

```sh
firebase deploy --only functions:paySampleOrder
```

### 4. Start payment

order.paymentStatus が PaymentRequested になると購入処理が実行されます。  
下記は TypeScript での例ですが、実際にはクライアント側([starhoshi/Orderable](https://github.com/starhoshi/Orderable))でやるべき処理です。

```ts
order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
await order.update()
```

### 5. Result

購入処理が成功すると、 `neoTask.status === 1` になります。それを処理の完了として扱ってください。

```ts
if (order.neoTask && order.neoTask.status === 1) {
  // payment completed
}
```

## Error

TODO
