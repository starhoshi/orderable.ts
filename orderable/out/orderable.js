"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const FirebaseFirestore = require("@google-cloud/firestore");
const Stripe = require("stripe");
const pring_1 = require("pring");
const retrycf_1 = require("retrycf");
const Flow = require("@1amageek/flow");
const request = require("request");
let stripe;
let firestore;
let slackParams;
exports.initialize = (options) => {
    pring_1.Pring.initialize(options.adminOptions);
    retrycf_1.Retrycf.initialize(options.adminOptions);
    firestore = new FirebaseFirestore.Firestore(options.adminOptions);
    stripe = new Stripe(options.stripeToken);
    slackParams = options.slack;
};
class Slack {
    constructor(params = slackParams) {
        this.enabled = true;
        this.enabled = params.enabled || slackParams.enabled;
        if (this.enabled) {
            this.url = params.url;
            this.channel = params.channel;
            this.username = params.username || 'cloud-functions-police';
            this.iconEmoji = params.iconEmoji || ':warning:';
        }
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled) {
                return;
            }
            const options = {
                json: {
                    channel: this.channel,
                    username: this.username,
                    text: text,
                    icon_emoji: this.iconEmoji
                }
            };
            yield request.post(this.url, options, (error, response, body) => {
                if (error || response.statusCode !== 200) {
                    throw `slack error: ${error}, response.statusCode: ${response.statusCode}, body: ${body}`;
                }
            });
        });
    }
}
var ValidationErrorType;
(function (ValidationErrorType) {
    ValidationErrorType["ShopIsNotActive"] = "ShopIsNotActive";
    ValidationErrorType["SKUIsNotActive"] = "SKUIsNotActive";
    ValidationErrorType["OutOfStock"] = "OutOfStock";
    ValidationErrorType["StripeCardError"] = "StripeCardError";
    ValidationErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    ValidationErrorType["StripeCardExpired"] = "StripeCardExpired";
})(ValidationErrorType = exports.ValidationErrorType || (exports.ValidationErrorType = {}));
class FlowError extends Error {
    constructor(task, error) {
        super();
        this.task = task;
        this.error = error;
    }
}
exports.FlowError = FlowError;
class NeoTask extends retrycf_1.Retrycf.NeoTask {
    static setFatalAndPostToSlackIfRetryCountIsMax(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const neoTask = yield NeoTask.setFatalIfRetryCountIsMax(event);
            if (neoTask) {
                yield new Slack().post(`fatal error! step: retry_failed, error: ${JSON.stringify(neoTask.rawValue())}`);
            }
        });
    }
    static setFatalAndPostToSlack(event, step, error) {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Slack().post(`fatal error! step: ${step}, error: ${error}`);
            return NeoTask.setFatal(event, step, error);
        });
    }
}
exports.NeoTask = NeoTask;
var Model;
(function (Model) {
    class HasNeoTask extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], HasNeoTask.prototype, "neoTask", void 0);
    Model.HasNeoTask = HasNeoTask;
    class User extends pring_1.Pring.Base {
    }
    Model.User = User;
    class Shop extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.isActive = true;
            this.freePostageMinimumPrice = -1;
        }
    }
    __decorate([
        pring_1.property
    ], Shop.prototype, "name", void 0);
    __decorate([
        pring_1.property
    ], Shop.prototype, "isActive", void 0);
    __decorate([
        pring_1.property
    ], Shop.prototype, "freePostageMinimumPrice", void 0);
    Model.Shop = Shop;
    class Product extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], Product.prototype, "name", void 0);
    Model.Product = Product;
    let StockType;
    (function (StockType) {
        StockType["Unknown"] = "unknown";
        StockType["Finite"] = "finite";
        StockType["Infinite"] = "infinite";
    })(StockType = Model.StockType || (Model.StockType = {}));
    class SKU extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.price = 0;
            this.stockType = StockType.Unknown;
            this.stock = 0;
            this.isPublished = true;
            this.isActive = true;
            // 在庫チェック
            // hasStock(quantity: number): boolean {
            //   return this.stock - quantity >= 0
            // }
        }
    }
    __decorate([
        pring_1.property
    ], SKU.prototype, "price", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "stockType", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "stock", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "isPublished", void 0);
    __decorate([
        pring_1.property
    ], SKU.prototype, "isActive", void 0);
    Model.SKU = SKU;
    let OrderPaymentStatus;
    (function (OrderPaymentStatus) {
        OrderPaymentStatus[OrderPaymentStatus["Unknown"] = 0] = "Unknown";
        OrderPaymentStatus[OrderPaymentStatus["Created"] = 1] = "Created";
        OrderPaymentStatus[OrderPaymentStatus["PaymentRequested"] = 2] = "PaymentRequested";
        OrderPaymentStatus[OrderPaymentStatus["WaitingForPayment"] = 3] = "WaitingForPayment";
        OrderPaymentStatus[OrderPaymentStatus["Paid"] = 4] = "Paid";
    })(OrderPaymentStatus = Model.OrderPaymentStatus || (Model.OrderPaymentStatus = {}));
    class StripeCharge extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], StripeCharge.prototype, "cardID", void 0);
    __decorate([
        pring_1.property
    ], StripeCharge.prototype, "customerID", void 0);
    __decorate([
        pring_1.property
    ], StripeCharge.prototype, "chargeID", void 0);
    Model.StripeCharge = StripeCharge;
    class Order extends HasNeoTask {
        constructor() {
            super(...arguments);
            this.amount = 0;
            this.expirationDate = new Date().setHours(new Date().getHours() + 1);
            this.orderSKUs = new pring_1.Pring.ReferenceCollection(this);
            this.paymentStatus = OrderPaymentStatus.Created;
        }
        isCharged() {
            if (this.stripe && this.stripe.chargeID) {
                return true;
            }
            return false;
        }
    }
    __decorate([
        pring_1.property
    ], Order.prototype, "user", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "amount", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "paidDate", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "expirationDate", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "currency", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "orderSKUs", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "paymentStatus", void 0);
    __decorate([
        pring_1.property
    ], Order.prototype, "stripe", void 0);
    Model.Order = Order;
    let OrderShopPaymentStatus;
    (function (OrderShopPaymentStatus) {
        OrderShopPaymentStatus[OrderShopPaymentStatus["Unknown"] = 0] = "Unknown";
        OrderShopPaymentStatus[OrderShopPaymentStatus["Created"] = 1] = "Created";
        OrderShopPaymentStatus[OrderShopPaymentStatus["Paid"] = 2] = "Paid";
    })(OrderShopPaymentStatus = Model.OrderShopPaymentStatus || (Model.OrderShopPaymentStatus = {}));
    class OrderShop extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.orderSKUs = new pring_1.Pring.ReferenceCollection(this);
            this.paymentStatus = OrderShopPaymentStatus.Unknown;
        }
    }
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "orderSKUs", void 0);
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "paymentStatus", void 0);
    __decorate([
        pring_1.property
    ], OrderShop.prototype, "user", void 0);
    Model.OrderShop = OrderShop;
    class OrderSKU extends pring_1.Pring.Base {
        constructor() {
            super(...arguments);
            this.quantity = 0;
        }
    }
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "snapshotSKU", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "snapshotProduct", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "quantity", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "sku", void 0);
    __decorate([
        pring_1.property
    ], OrderSKU.prototype, "shop", void 0);
    Model.OrderSKU = OrderSKU;
})(Model = exports.Model || (exports.Model = {}));
var StripeErrorType;
(function (StripeErrorType) {
    StripeErrorType["StripeCardError"] = "StripeCardError";
    StripeErrorType["RateLimitError"] = "RateLimitError";
    StripeErrorType["StripeInvalidRequestError"] = "StripeInvalidRequestError";
    // An error occurred internally with Stripe's API
    StripeErrorType["StripeAPIError"] = "StripeAPIError";
    StripeErrorType["StripeConnectionError"] = "StripeConnectionError";
    StripeErrorType["StripeAuthenticationError"] = "StripeAuthenticationError";
    StripeErrorType["UnexpectedError"] = "UnexpectedError";
})(StripeErrorType = exports.StripeErrorType || (exports.StripeErrorType = {}));
class StripeError extends Error {
    constructor(error) {
        super();
        if (!error.type) {
            console.error(error);
            throw 'unexpected stripe error';
        }
        this.error = error;
        this.message = error.message;
        this.statusCode = error.statusCode;
        this.requestId = error.requestId;
        switch (error.type) {
            case 'StripeCardError':
                this.type = StripeErrorType.StripeCardError;
                break;
            case 'RateLimitError':
                this.type = StripeErrorType.RateLimitError;
                break;
            case 'StripeInvalidRequestError':
                this.type = StripeErrorType.StripeInvalidRequestError;
                break;
            case 'StripeAPIError':
                this.type = StripeErrorType.StripeAPIError;
                break;
            case 'StripeConnectionError':
                this.type = StripeErrorType.StripeConnectionError;
                break;
            case 'StripeAuthenticationError':
                this.type = StripeErrorType.StripeAuthenticationError;
                break;
            default:
                this.type = StripeErrorType.UnexpectedError;
                break;
        }
    }
    setNeoTask(event, step) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (this.type) {
                // validate
                case StripeErrorType.StripeCardError: {
                    const validationError = new retrycf_1.Retrycf.ValidationError(ValidationErrorType.StripeCardError, this.message);
                    return yield NeoTask.setInvalid(event, validationError);
                }
                case StripeErrorType.StripeInvalidRequestError: {
                    const validationError = new retrycf_1.Retrycf.ValidationError(ValidationErrorType.StripeInvalidRequestError, this.message);
                    return yield NeoTask.setInvalid(event, validationError);
                }
                // retry
                case StripeErrorType.StripeAPIError:
                case StripeErrorType.StripeConnectionError:
                    return yield NeoTask.setRetry(event, step, this.message);
                // fatal
                case StripeErrorType.RateLimitError:
                case StripeErrorType.StripeAuthenticationError:
                case StripeErrorType.UnexpectedError:
                    return yield NeoTask.setFatalAndPostToSlack(event, step, this.type);
                default:
                    return yield NeoTask.setFatalAndPostToSlack(event, step, this.type);
            }
        });
    }
}
exports.StripeError = StripeError;
var Functions;
(function (Functions) {
    class OrderSKUObject {
        static fetchFrom(order) {
            return __awaiter(this, void 0, void 0, function* () {
                const orderSKURefs = yield order.orderSKUs.get(Model.OrderSKU);
                const orderSKUObjects = yield Promise.all(orderSKURefs.map(orderSKURef => {
                    return Model.OrderSKU.get(orderSKURef.id).then(s => {
                        const orderSKU = s;
                        const orderSKUObject = new OrderSKUObject();
                        orderSKUObject.orderSKU = orderSKU;
                        return orderSKUObject;
                    });
                }));
                yield Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
                    return orderSKUObject.orderSKU.sku.get().then(skuSnapshop => {
                        const s = new Model.SKU();
                        s.init(skuSnapshop);
                        orderSKUObjects[index].sku = s;
                    });
                }));
                return orderSKUObjects;
            });
        }
    }
    class OrderObject {
        static fetchShopsFrom(orderSKUObjects) {
            return __awaiter(this, void 0, void 0, function* () {
                return yield Promise.all(orderSKUObjects.map(orderSKUObject => {
                    return orderSKUObject.orderSKU.shop;
                }).filter((shopRef, index, self) => {
                    return self.indexOf(shopRef) === index;
                }).map(shopRef => {
                    return shopRef.get().then(shopSnapshot => {
                        const shop = new Model.Shop();
                        shop.init(shopSnapshot);
                        return shop;
                    });
                }));
            });
        }
        constructor(orderID, event) {
            this.orderID = orderID;
            this.event = event;
        }
        updateStock(operator) {
            const orderSKUObjects = this.orderSKUObjects;
            if (!orderSKUObjects) {
                throw Error('orderSKUObjects must be non-null');
            }
            return firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                const promises = [];
                for (const orderSKUObject of orderSKUObjects) {
                    const skuRef = firestore.collection(`version/1/sku`).doc(orderSKUObject.sku.id);
                    const t = transaction.get(skuRef).then(tsku => {
                        const quantity = orderSKUObject.orderSKU.quantity * operator;
                        const newStock = tsku.data().stock + quantity;
                        if (newStock >= 0) {
                            transaction.update(skuRef, { stock: newStock });
                        }
                        else {
                            throw new retrycf_1.Retrycf.ValidationError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.snapshotProduct.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`);
                        }
                    });
                    promises.push(t);
                }
                // 重複実行された時に、2回目の実行を弾く
                console.log('mark ref', this.event.data.ref);
                promises.push(NeoTask.markComplete(this.event, transaction, 'validateAndDecreaseStock'));
                return Promise.all(promises);
            }));
        }
    }
    let Operator;
    (function (Operator) {
        Operator[Operator["plus"] = 1] = "plus";
        Operator[Operator["minus"] = -1] = "minus";
    })(Operator || (Operator = {}));
    const prepareRequiredData = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = yield Model.Order.get(orderObject.orderID);
            const user = yield order.user.get().then(s => {
                const u = new Model.User();
                u.init(s);
                return u;
            });
            const orderSKUObjects = yield OrderSKUObject.fetchFrom(order);
            const shops = yield OrderObject.fetchShopsFrom(orderSKUObjects);
            // TODO if stripe
            const stripeCard = yield stripe.customers.retrieveCard(order.stripe.customerID, order.stripe.cardID);
            console.log('amount', order.amount);
            console.log('stripe', order.stripe);
            orderObject.order = order;
            orderObject.user = user;
            orderObject.orderSKUObjects = orderSKUObjects;
            orderObject.shops = shops;
            orderObject.stripeCard = stripeCard;
            return orderObject;
        }
        catch (error) {
            // ここで起きるエラーは取得エラーのみのはずなので retry
            const neoTask = yield NeoTask.setRetry(orderObject.event, 'prepareRequiredData', error);
            throw new FlowError(neoTask, error);
        }
    }));
    const validateShopIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const shops = orderObject.shops;
            // 決済済みだったらスキップして良い
            if (order.isCharged()) {
                return orderObject;
            }
            shops.forEach((shop, index) => {
                if (!shop.isActive) {
                    throw new retrycf_1.Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive, `ショップ「${shop.name}」は現在ご利用いただけません。`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === retrycf_1.Retrycf.ValidationError) {
                const validationError = error;
                const neoTask = yield NeoTask.setInvalid(orderObject.event, validationError);
                throw new FlowError(neoTask, error);
            }
            throw (error);
        }
    }));
    const validateSKUIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const orderSKUObjects = orderObject.orderSKUObjects;
            // 決済済みだったらスキップして良い
            if (order.isCharged()) {
                return orderObject;
            }
            orderSKUObjects.forEach((orderSKUObject, index) => {
                if (!orderSKUObject.sku.isActive) {
                    throw new retrycf_1.Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive, `商品「${orderSKUObject.orderSKU.snapshotProduct.name}」は現在ご利用いただけません。`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === retrycf_1.Retrycf.ValidationError) {
                const validationError = error;
                const neoTask = yield NeoTask.setInvalid(orderObject.event, validationError);
                throw new FlowError(neoTask, error);
            }
            throw (error);
        }
    }));
    const validateCardExpired = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const stripeCard = orderObject.stripeCard;
            // 決済済みだったらスキップ
            if (order.isCharged()) {
                return orderObject;
            }
            const now = new Date(new Date().getFullYear(), new Date().getMonth());
            const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1);
            if (expiredDate < now) {
                throw new retrycf_1.Retrycf.ValidationError(ValidationErrorType.StripeCardExpired, 'カードの有効期限が切れています。');
            }
            return orderObject;
        }
        catch (error) {
            if (error.constructor === retrycf_1.Retrycf.ValidationError) {
                const validationError = error;
                const neoTask = yield NeoTask.setInvalid(orderObject.event, validationError);
                throw new FlowError(neoTask, error);
            }
            throw (error);
        }
    }));
    const validateAndDecreaseStock = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // 決済済みだったらスキップして良い
            if (order.isCharged()) {
                return orderObject;
            }
            yield orderObject.updateStock(Operator.minus);
            return orderObject;
        }
        catch (error) {
            if (error.constructor === retrycf_1.Retrycf.ValidationError) {
                const validationError = error;
                const neoTask = yield NeoTask.setInvalid(orderObject.event, validationError);
                throw new FlowError(neoTask, error);
            }
            throw (error);
        }
    }));
    const stripeCharge = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const user = orderObject.user;
            const currency = order.currency;
            // 決済済み
            if (order.isCharged()) {
                return orderObject;
            }
            const charge = yield stripe.charges.create({
                amount: order.amount,
                currency: currency,
                customer: order.stripe.customerID,
                source: order.stripe.cardID,
                transfer_group: order.id,
                metadata: {
                    orderID: order.id,
                    rawValue: order.rawValue()
                }
            }, {
                idempotency_key: order.id
            }).catch(e => {
                throw new StripeError(e);
            });
            orderObject.stripeCharge = charge;
            return orderObject;
        }
        catch (error) {
            // 在庫数を減らした後に stripe.charge が失敗したので、在庫数を元に戻す
            yield orderObject.updateStock(Operator.plus);
            yield NeoTask.clearComplete(orderObject.event);
            if (error.constructor === StripeError) {
                const stripeError = new StripeError(error);
                const neoTask = yield stripeError.setNeoTask(orderObject.event, 'stripeCharge');
                throw new FlowError(neoTask, error);
            }
            throw (error);
        }
    }));
    /// ここでこけたらおわり、 charge が浮いている状態になる。
    const updateOrder = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // 決済済み
            if (order.isCharged()) {
                return orderObject;
            }
            const charge = orderObject.stripeCharge;
            order.paymentStatus = Model.OrderPaymentStatus.Paid;
            order.stripe.chargeID = charge.id;
            yield order.update();
            console.log('charge completed');
            return orderObject;
        }
        catch (error) {
            // ここでコケたら stripeChargeID すらわからなくなってしまうので retry もできないので fatal
            const neoTask = yield NeoTask.setFatalAndPostToSlack(orderObject.event, 'updateOrder', error);
            throw new FlowError(neoTask, error);
        }
    }));
    const updateOrderShops = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            yield admin.firestore().collection('version/1/ordershop')
                .where('order', '==', admin.firestore().collection(`version/1/order`).doc(order.id))
                .get()
                .then(snapshot => {
                const batch = admin.firestore().batch();
                // OrderShopStatus が Create のだけ Paid に更新する。
                snapshot.docs.filter(doc => {
                    const orderShop = new Model.OrderShop();
                    orderShop.init(doc);
                    return orderShop.paymentStatus === Model.OrderShopPaymentStatus.Created;
                }).forEach(doc => {
                    batch.update(doc.ref, { paymentStatus: Model.OrderShopPaymentStatus.Paid });
                });
                return batch.commit();
            });
            return orderObject;
        }
        catch (error) {
            // 失敗する可能性があるのは batch の失敗だけなので retry
            const neoTask = yield NeoTask.setRetry(orderObject.event, 'updateOrderShops', error);
            throw new FlowError(neoTask, error);
        }
    }));
    const setOrderTask = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // await Task.success(order.reference, order.rawValue())
            yield NeoTask.success(orderObject.event);
            return orderObject;
        }
        catch (error) {
            // 失敗する可能性があるのは update の失敗だけなので retry
            const neoTask = yield NeoTask.setRetry(orderObject.event, 'setOrderTask', error);
            throw new FlowError(neoTask, error);
        }
    }));
    Functions.orderPaymentRequested = (event) => __awaiter(this, void 0, void 0, function* () {
        // functions.firestore.document(`version/1/order/{orderID}`).onUpdate(async event => {
        try {
            const shouldRetry = NeoTask.shouldRetry(event.data);
            yield NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(event);
            // status が payment requested に変更された時
            // もしくは should retry が true だった時にこの functions は実行される
            // if (ValueChanges.for('status', event.data) !== ValueChangesResult.updated && !shouldRetry) {
            //   return undefined
            // }
            if (event.data.data().paymentStatus !== Model.OrderPaymentStatus.PaymentRequested && !shouldRetry) {
                return undefined;
            }
            if (!event.params || !event.params.orderID) {
                throw Error('orderID must be non-null');
            }
            const orderObject = new OrderObject(event.params.orderID, event);
            const flow = new Flow.Line([
                prepareRequiredData,
                validateShopIsActive,
                validateSKUIsActive,
                validateCardExpired,
                validateAndDecreaseStock,
                stripeCharge,
                updateOrder,
                updateOrderShops,
                setOrderTask
            ]);
            try {
                yield flow.run(orderObject);
            }
            catch (e) {
                throw e;
            }
            return Promise.resolve();
        }
        catch (error) {
            console.error(error);
            if (error.constructor === retrycf_1.Retrycf.CompletedError) {
                // 関数の重複実行エラーだった場合は task にエラーを書かずに undefined を返して処理を抜ける
                return undefined;
            }
            else {
                // await Task.failure(event.data.ref, TaskAction.resume, event.data.data(), new TaskError(error.toString()))
            }
            if (error.constructor !== FlowError) {
                yield NeoTask.setFatalAndPostToSlack(event, 'orderPaymentRequested', error.toString());
            }
            return Promise.reject(error);
        }
    });
})(Functions = exports.Functions || (exports.Functions = {}));
