"use strict";
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
let slackParams = undefined;
exports.initialize = (options) => {
    pring_1.Pring.initialize(options.adminOptions);
    retrycf_1.Retrycf.initialize(options.adminOptions);
    firestore = new FirebaseFirestore.Firestore(options.adminOptions);
    stripe = new Stripe(options.stripeToken);
    slackParams = options.slack;
    console.log('initialized', firestore);
};
class Slack {
    constructor(params = slackParams) {
        this.slackParams = undefined;
        this.slackParams = params;
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.slackParams) {
                return;
            }
            const options = {
                json: {
                    channel: this.slackParams.channel,
                    username: this.slackParams.username,
                    text: text,
                    icon_emoji: this.slackParams.iconEmoji
                }
            };
            yield request.post(this.slackParams.url, options, (error, response, body) => {
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
    class Orderable extends pring_1.Pring.Base {
        didFetchCompleted() {
            return this.isSaved;
        }
        getCollectionPath() {
            return `version/${this.getVersion()}/${this.getModelName()}`;
        }
        get(id) {
            return __awaiter(this, void 0, void 0, function* () {
                return admin.firestore().collection(this.getCollectionPath()).doc(id).get().then(s => {
                    this.init(s);
                    return this;
                });
            });
        }
    }
    Model.Orderable = Orderable;
    let StockType;
    (function (StockType) {
        StockType["Unknown"] = "unknown";
        StockType["Finite"] = "finite";
        StockType["Infinite"] = "infinite";
    })(StockType = Model.StockType || (Model.StockType = {}));
    let OrderPaymentStatus;
    (function (OrderPaymentStatus) {
        OrderPaymentStatus[OrderPaymentStatus["Unknown"] = 0] = "Unknown";
        OrderPaymentStatus[OrderPaymentStatus["Created"] = 1] = "Created";
        OrderPaymentStatus[OrderPaymentStatus["PaymentRequested"] = 2] = "PaymentRequested";
        OrderPaymentStatus[OrderPaymentStatus["WaitingForPayment"] = 3] = "WaitingForPayment";
        OrderPaymentStatus[OrderPaymentStatus["Paid"] = 4] = "Paid";
    })(OrderPaymentStatus = Model.OrderPaymentStatus || (Model.OrderPaymentStatus = {}));
    let OrderShopPaymentStatus;
    (function (OrderShopPaymentStatus) {
        OrderShopPaymentStatus[OrderShopPaymentStatus["Unknown"] = 0] = "Unknown";
        OrderShopPaymentStatus[OrderShopPaymentStatus["Created"] = 1] = "Created";
        OrderShopPaymentStatus[OrderShopPaymentStatus["Paid"] = 2] = "Paid";
    })(OrderShopPaymentStatus = Model.OrderShopPaymentStatus || (Model.OrderShopPaymentStatus = {}));
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
        static fetchFrom(order, orderSKUType, skuType) {
            return __awaiter(this, void 0, void 0, function* () {
                // const orderSKURefs = await order.orderSKUs.get(Model.OrderSKU)
                const orderSKURefs = yield order.orderSKUs.get(orderSKUType);
                const orderSKUObjects = yield Promise.all(orderSKURefs.map(orderSKURef => {
                    return new orderSKUType().get(orderSKURef.id).then(s => {
                        // const orderSKU = s as Model.OrderSKU
                        const orderSKUObject = new OrderSKUObject();
                        orderSKUObject.orderSKU = s;
                        return orderSKUObject;
                    });
                }));
                yield Promise.all(orderSKUObjects.map((orderSKUObject, index) => {
                    return orderSKUObject.orderSKU.sku.get().then(skuSnapshop => {
                        const s = new skuType();
                        s.init(skuSnapshop);
                        orderSKUObjects[index].sku = s;
                    });
                }));
                return orderSKUObjects;
            });
        }
    }
    Functions.OrderSKUObject = OrderSKUObject;
    class OrderObject {
        constructor(event, initializableClass) {
            this.event = event;
            this.orderID = event.params.orderID;
            this.initializableClass = initializableClass;
        }
        getShops() {
            return __awaiter(this, void 0, void 0, function* () {
                this.shops = yield Promise.all(this.orderSKUObjects.map(orderSKUObject => {
                    return orderSKUObject.orderSKU.shop;
                }).filter((shopRef, index, self) => {
                    return self.indexOf(shopRef) === index;
                }).map(shopRef => {
                    return shopRef.get().then(shopSnapshot => {
                        const shop = new this.initializableClass.shop();
                        shop.init(shopSnapshot);
                        return shop;
                    });
                }));
            });
        }
        isCharged() {
            if (this.order && this.order.stripe && this.order.stripe.chargeID) {
                return true;
            }
            return false;
        }
        updateStock(operator) {
            const orderSKUObjects = this.orderSKUObjects;
            const order = this.order;
            if (!orderSKUObjects) {
                throw Error('orderSKUObjects must be non-null');
            }
            if (!order) {
                throw Error('orderSKUObjects must be non-null');
            }
            return firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                const promises = [];
                for (const orderSKUObject of orderSKUObjects) {
                    const skuRef = firestore.collection(new this.initializableClass.sku().getCollectionPath()).doc(orderSKUObject.sku.id);
                    const t = transaction.get(skuRef).then(tsku => {
                        const quantity = orderSKUObject.orderSKU.quantity * operator;
                        console.log(tsku.data());
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
                // // 重複実行された時に、2回目の実行を弾く
                const step = 'validateAndDecreaseStock';
                // promises.push(KomercoNeoTask.markComplete(this.event, transaction, 'validateAndDecreaseStock'))
                const orderRef = firestore.doc(order.getPath());
                const orderPromise = transaction.get(orderRef).then(tref => {
                    if (retrycf_1.Retrycf.NeoTask.isCompleted(this.event, 'validateAndDecreaseStock')) {
                        throw new retrycf_1.Retrycf.CompletedError('validateAndDecreaseStock');
                    }
                    else {
                        const neoTask = new retrycf_1.Retrycf.NeoTask(this.event.data);
                        neoTask.completed[step] = true;
                        transaction.update(orderRef, { neoTask: neoTask.rawValue() });
                    }
                });
                promises.push(orderPromise);
                return Promise.all(promises);
            }));
        }
    }
    Functions.OrderObject = OrderObject;
    let Operator;
    (function (Operator) {
        Operator[Operator["plus"] = 1] = "plus";
        Operator[Operator["minus"] = -1] = "minus";
    })(Operator = Functions.Operator || (Functions.Operator = {}));
    const prepareRequiredData = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = yield new orderObject.initializableClass.order().get(orderObject.orderID);
            orderObject.order = order;
            const user = yield new orderObject.initializableClass.user().get(order.user.id);
            orderObject.user = user;
            const orderSKUObjects = yield OrderSKUObject.fetchFrom(order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku);
            orderObject.orderSKUObjects = orderSKUObjects;
            yield orderObject.getShops();
            console.log('shops', orderObject.shops);
            const stripeCard = yield stripe.customers.retrieveCard(order.stripe.customerID, order.stripe.cardID);
            orderObject.stripeCard = stripeCard;
            console.log('amount', order.amount);
            console.log('stripe', order.stripe);
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
            if (orderObject.isCharged()) {
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
            if (orderObject.isCharged()) {
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
            if (orderObject.isCharged()) {
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
            if (orderObject.isCharged()) {
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
            if (orderObject.isCharged()) {
                return orderObject;
            }
            const charge = yield stripe.charges.create({
                amount: order.amount,
                currency: currency,
                customer: order.stripe.customerID,
                source: order.stripe.cardID,
                transfer_group: order.id,
                metadata: {
                    orderID: order.id
                    // , rawValue: order.rawValue()
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
            if (orderObject.isCharged()) {
                return orderObject;
            }
            const charge = orderObject.stripeCharge;
            order.paymentStatus = Model.OrderPaymentStatus.Paid;
            order.stripe.chargeID = charge.id;
            order.paidDate = FirebaseFirestore.FieldValue.serverTimestamp();
            // FIXME: Error: Cannot encode type ([object Object]) to a Firestore Value
            // await order.update()
            yield order.reference.update({
                paymentStatus: Model.OrderPaymentStatus.Paid,
                chargeID: charge.id,
                paidDate: FirebaseFirestore.FieldValue.serverTimestamp(),
                updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
            });
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
            yield admin.firestore().collection(new orderObject.initializableClass.orderShop().getCollectionPath())
                .where('order', '==', admin.firestore().collection(new orderObject.initializableClass.order().getCollectionPath()).doc(orderObject.orderID))
                .get()
                .then(snapshot => {
                const batch = admin.firestore().batch();
                // OrderShopStatus が Create のだけ Paid に更新する
                snapshot.docs.filter(doc => {
                    const orderShop = new orderObject.initializableClass.orderShop();
                    orderShop.init(doc);
                    return orderShop.paymentStatus === Model.OrderShopPaymentStatus.Created;
                }).forEach(doc => {
                    batch.update(doc.ref, {
                        paymentStatus: Model.OrderShopPaymentStatus.Paid,
                        updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
                    });
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
    Functions.orderPaymentRequested = (event, orderObject) => __awaiter(this, void 0, void 0, function* () {
        // functions.firestore.document(`version/1/order/{orderID}`).onUpdate(async event => {
        try {
            const shouldRetry = NeoTask.shouldRetry(event.data);
            yield NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(event);
            // status が payment requested に変更された時
            // もしくは should retry が true だった時にこの functions は実行される
            // if (ValueChanges.for('status', event.data) !== ValueChangesResult.updated && !shouldRetry) {
            console.log('pre', event.data.previous.data().paymentStatus);
            console.log('cur', event.data.data().paymentStatus);
            if (event.data.previous.data().paymentStatus === Model.OrderPaymentStatus.Created && event.data.data().paymentStatus === Model.OrderPaymentStatus.PaymentRequested) {
                // 処理実行、リトライは実行されない
                console.log('exec', event.data.previous.data().paymentStatus, event.data.data().paymentStatus);
            }
            else {
                console.log('undefined');
                return undefined;
            }
            if (event.data.data().paymentStatus !== Model.OrderPaymentStatus.PaymentRequested && !shouldRetry) {
                return undefined;
            }
            if (!event.params || !event.params.orderID) {
                throw Error('orderID must be non-null');
            }
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
