<p align="center">
    <img src="https://raw.githubusercontent.com/starhoshi/orderable.ts/master/docs/logo.png" width='180px' />
</p>

# orderable.ts

<b>⚠️　Orderable は現在開発中です ⚠️</b>

orderable.ts は Cloud Functions for Firebase と連携し、決済が簡単に実行できるライブラリです。  
EC に必要な在庫チェック、購入処理、購入後の履歴作成などを実行できます。

iOS 側は [starhoshi/Orderable](https://github.com/starhoshi/Orderable) を利用してください。

## Installation

yarn を使ってください。 npm では依存性の解決ができずエラーになります。  
また、 typescript を使うことを推奨します。

```
yarn add @star__hoshi/orderable
```

## Settings

[orderable\.ts/index\.ts](https://github.com/starhoshi/orderable.ts/blob/master/sample-cloud-functions/functions/src/index.ts) にサンプルの functions がありますので参考にしてください。

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

index.ts で Orderable と pring.ts を initialize してください。

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

### 2. Model 定義

[orderable\.ts/sampleModel\.ts](https://github.com/starhoshi/orderable.ts/blob/master/sample-cloud-functions/functions/src/sampleModel.ts) を参考に、あなたのプロジェクトで必要な Model の定義をしてください。

* User
  * 購入者
* Shop
  * 販売者
* Product
  * 商品の概念。
* SKU
  * 商品の実態。在庫や値段などを持つ。
* Order
  * 注文。ユーザが支払う金額や支払い方法などを持つ。
* OrderShop
  * Shop ごとの注文情報。
* OrderSKU
  * 注文された商品。購入数などを持つ。

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
    
    try {
      Orderable.Functions.orderPaymentRequested(event, orderObject)
    } catch (e) {
      console.error(e)
    }
  })
```

deploy:

```sh
firebase deploy --only functions:paySampleOrder
```

### 4. Start payment

order.paymentStatus が PaymentRequested になると購入処理が実行されます。  

```ts
order.paymentStatus = Orderable.Model.OrderPaymentStatus.PaymentRequested
await order.update()
```

上記は TypeScript での例ですが、実際にはクライアント側([starhoshi/Orderable](https://github.com/starhoshi/Orderable))でやるべき処理です。

### 5. Result

購入処理が成功すると、 `neoTask.status === 1` になります。それを処理の完了として扱ってください。

```ts
if (order.neoTask && order.neoTask.status === 1) {
  // payment completed
}
```

また、各モデルのステータスは下記のように変更されます。

* Order
    * paymentStatus === 4 (Orderable.OrderPaymentStatus.Paid)
* OrderShop[]
    * paymentStatus === 3 (Orderable.OrderShopPaymentStatus.Paid)

## Error

### NeoTask

処理が途中で失敗すると、 Order.neoTask にエラーの情報が書き込まれます。  
この場合、 `neoTask.status === 2` になります。

#### NeoTask.invalid

決済を行うにあたって必須の条件が設定されていない時にセットされます。  
例えば、在庫が足りていない場合や、クレジットカードが不正だった時です。

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

必要な条件を再度設定し、 4. Start payment のトリガーを再度実行してください。  
場合によっては Order を作り直した方が良いかもしれません。

#### NeoTask.fatal

回復不能なエラーが発生した時にセットされます。  
例えば決済が完了したフラグを保存しようとした時、などです。

この場合はどうしようもないので、デベロッパーが直接データを見て修正してください。

#### NeoTask.retry

retry は、全く同じ状態のまま Cloud Functions を再実行すれば解決できる状態です。  
この場合、 __Orderable が自動で__ retry を行います。

retry を 2 回行い、それでも失敗した場合は fatal エラーが書き込まれます。  
成功した場合は neoTask.status が 1 になります。

retry の後すぐに fatal か success に変わるため、それを待ってください。

### FlowError

処理が途中で失敗すると、 FlowError という型の Error を catch できます。　　
FlowError の中にはさらに error があり、それを見てデベロッパー側でもエラーハンドリングができます。

```ts
    try {
      Orderable.Functions.orderPaymentRequested(event, orderObject)
    } catch (e) {
      console.error(e)
      if (e.error.constructor === Orderable.StripeError) {
        // post to slack ...
      }
    }
```

## Q & A

### Cloud Functions が複数回発火した場合は?

> Note: Trigger events are delivered at least once, which means that rarely, spurious duplicates may occur.
> https://cloud.google.com/functions/docs/concepts/events-triggers#triggers

Cloud Functions は稀に複数回発火することがあります。  
そうすると複数回在庫が減ったり、 __多重決済__ が起きてしまいます。

関数が複数回実行されてしまうのを防ぐために transaction を使い、処理が完了したことを保存し2回目の関数実行では決済処理までたどり着かないようになっています。  
https://github.com/starhoshi/orderable.ts/blob/master/orderable/src/orderable.ts#L433-L434
