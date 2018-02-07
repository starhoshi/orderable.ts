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
const FirebaseFirestore = require("@google-cloud/firestore");
const Stripe = require("stripe");
const pring_1 = require("pring");
const Retrycf = require("retrycf");
const Flow = require("@1amageek/flow");
const Slack = require("slack-node");
let stripe;
let firestore;
let slackParams = undefined;
const slack = new Slack();
let adminOptions;
exports.initialize = (options) => {
    pring_1.Pring.initialize(options.adminOptions);
    Retrycf.initialize(options.adminOptions);
    firestore = new FirebaseFirestore.Firestore(options.adminOptions);
    stripe = new Stripe(options.stripeToken);
    adminOptions = options.adminOptions;
    if (options.slack) {
        slackParams = options.slack;
        slack.setWebhook(options.slack.url);
    }
};
class Webhook {
    static postError(step, error, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!slackParams) {
                return;
            }
            const attachments = {
                color: 'danger',
                ts: new Date().getTime() / 1000,
                fields: [
                    { title: 'step', value: step, short: true },
                    { title: 'project_id', value: adminOptions.projectId || 'Unknown', short: true },
                    { title: 'path', value: path },
                    { title: 'error', value: error }
                ]
            };
            slack.webhook({
                channel: slackParams.channel,
                icon_emoji: slackParams.iconEmoji,
                username: slackParams.username || 'cloud-functions',
                text: step,
                attachments: [attachments]
            }, (e, response) => {
                if (response.status === 'fail') {
                    console.warn('slack error', e);
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
    ValidationErrorType["PaymentInfoNotFound"] = "PaymentInfoNotFound";
})(ValidationErrorType = exports.ValidationErrorType || (exports.ValidationErrorType = {}));
class FlowError extends Error {
    constructor(error, task) {
        super();
        this.task = task;
        this.error = error;
    }
}
exports.FlowError = FlowError;
class NeoTask extends Retrycf.NeoTask {
    static setFatalAndPostToSlackIfRetryCountIsMax(model) {
        return __awaiter(this, void 0, void 0, function* () {
            model = yield NeoTask.setFatalIfRetryCountIsMax(model);
            if (model.neoTask && model.neoTask.fatal) {
                Webhook.postError('retry error', JSON.stringify(model.neoTask.rawValue()), model.reference.path);
            }
            return model;
        });
    }
    static setFatalAndPostToSlack(model, step, error) {
        return __awaiter(this, void 0, void 0, function* () {
            Webhook.postError(step, error.toString(), model.reference.path);
            return NeoTask.setFatal(model, step, error);
        });
    }
}
exports.NeoTask = NeoTask;
var Model;
(function (Model) {
    class Base extends pring_1.Pring.Base {
        get collectionPath() {
            return `version/${this.getVersion()}/${this.getModelName()}`;
        }
        get(id) {
            return __awaiter(this, void 0, void 0, function* () {
                return firestore.collection(this.collectionPath).doc(id).get().then(s => {
                    this.init(s);
                    return this;
                });
            });
        }
    }
    Model.Base = Base;
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
    setNeoTask(model, step) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (this.type) {
                // validate
                case StripeErrorType.StripeCardError: {
                    const validationError = new Retrycf.ValidationError(ValidationErrorType.StripeCardError, this.message);
                    model = yield NeoTask.setInvalid(model, validationError);
                    break;
                }
                case StripeErrorType.StripeInvalidRequestError: {
                    const validationError = new Retrycf.ValidationError(ValidationErrorType.StripeInvalidRequestError, this.message);
                    model = yield NeoTask.setInvalid(model, validationError);
                    break;
                }
                // retry
                case StripeErrorType.StripeAPIError:
                case StripeErrorType.StripeConnectionError:
                    model = yield NeoTask.setRetry(model, step, this.message);
                    break;
                // fatal
                case StripeErrorType.RateLimitError:
                case StripeErrorType.StripeAuthenticationError:
                case StripeErrorType.UnexpectedError:
                    model = yield NeoTask.setFatalAndPostToSlack(model, step, this.type);
                    break;
                default:
                    model = yield NeoTask.setFatalAndPostToSlack(model, step, this.type);
            }
            return model;
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
    let PaymentAgencyType;
    (function (PaymentAgencyType) {
        PaymentAgencyType[PaymentAgencyType["Unknown"] = 0] = "Unknown";
        PaymentAgencyType[PaymentAgencyType["Stripe"] = 1] = "Stripe";
    })(PaymentAgencyType = Functions.PaymentAgencyType || (Functions.PaymentAgencyType = {}));
    class OrderObject {
        constructor(event, initializableClass) {
            this.event = event;
            this.orderID = event.params.orderID;
            this.initializableClass = initializableClass;
            this.order = new initializableClass.order();
            this.order.init(event.data);
            this.previousOrder = new initializableClass.order();
            this.previousOrder.init(event.data.previous);
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
        get isCharged() {
            if (this.order && this.order.stripe && this.order.stripe.chargeID) {
                return true;
            }
            return false;
        }
        get paymentAgencyType() {
            if (!this.order) {
                return PaymentAgencyType.Unknown;
            }
            if (this.order.stripe) {
                return PaymentAgencyType.Stripe;
            }
            return PaymentAgencyType.Unknown;
        }
        updateStock(operator, step) {
            const orderSKUObjects = this.orderSKUObjects;
            // const order = this.order
            if (!orderSKUObjects) {
                throw Error('orderSKUObjects must be non-null');
            }
            // if (!order) { throw Error('orderSKUObjects must be non-null') }
            return firestore.runTransaction((transaction) => __awaiter(this, void 0, void 0, function* () {
                const promises = [];
                for (const orderSKUObject of orderSKUObjects) {
                    const skuRef = firestore.collection(new this.initializableClass.sku().collectionPath).doc(orderSKUObject.sku.id);
                    const t = transaction.get(skuRef).then(tsku => {
                        const quantity = orderSKUObject.orderSKU.quantity * operator;
                        const newStock = tsku.data().stock + quantity;
                        if (newStock >= 0) {
                            transaction.update(skuRef, { stock: newStock });
                        }
                        else {
                            throw new Retrycf.ValidationError(ValidationErrorType.OutOfStock, `${orderSKUObject.orderSKU.snapshotProduct.name} が在庫不足です。\n注文数: ${orderSKUObject.orderSKU.quantity}, 在庫数${orderSKUObject.sku.stock}`);
                        }
                    });
                    promises.push(t);
                }
                // // 重複実行された時に、2回目の実行を弾く
                // promises.push(KomercoNeoTask.markComplete(this.event, transaction, 'validateAndDecreaseStock'))
                const orderRef = firestore.doc(this.order.getPath());
                const orderPromise = transaction.get(orderRef).then(tref => {
                    if (Retrycf.NeoTask.isCompleted(this.order, step)) {
                        throw new Retrycf.CompletedError(step);
                    }
                    else {
                        // const neoTask = new Retrycf.NeoTask(this.event.data)
                        const neoTask = Retrycf.NeoTask.makeNeoTask(this.order);
                        const completed = { [step]: true };
                        neoTask.completed = completed;
                        this.order.neoTask = neoTask;
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
            const order = orderObject.order;
            // const order = await new orderObject.initializableClass.order().get(orderObject.orderID)
            // orderObject.order = order
            const user = yield new orderObject.initializableClass.user().get(order.user.id);
            orderObject.user = user;
            const orderSKUObjects = yield OrderSKUObject.fetchFrom(order, orderObject.initializableClass.orderSKU, orderObject.initializableClass.sku);
            orderObject.orderSKUObjects = orderSKUObjects;
            yield orderObject.getShops();
            if (orderObject.paymentAgencyType === PaymentAgencyType.Stripe) {
                const stripeCard = yield stripe.customers.retrieveCard(order.stripe.customerID, order.stripe.cardID);
                orderObject.stripeCard = stripeCard;
                console.log('stripe', order.stripe);
            }
            return orderObject;
        }
        catch (error) {
            // ここで起きるエラーは取得エラーのみのはずなので retry
            orderObject.order = yield NeoTask.setRetry(orderObject.order, 'prepareRequiredData', error);
            throw new FlowError(error, orderObject.order.neoTask);
        }
    }));
    const validateShopIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const shops = orderObject.shops;
            // 決済済みだったらスキップして良い
            if (orderObject.isCharged) {
                return orderObject;
            }
            shops.forEach((shop, index) => {
                if (!shop.isActive) {
                    throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive, `ショップ「${shop.name}」は現在ご利用いただけません。`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Retrycf.ValidationError) {
                const validationError = error;
                orderObject.order = yield NeoTask.setInvalid(orderObject.order, validationError);
                throw new FlowError(error, orderObject.order.neoTask);
            }
            throw (error);
        }
    }));
    const validateSKUIsActive = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const orderSKUObjects = orderObject.orderSKUObjects;
            // 決済済みだったらスキップして良い
            if (orderObject.isCharged) {
                return orderObject;
            }
            orderSKUObjects.forEach((orderSKUObject, index) => {
                if (!orderSKUObject.sku.isActive) {
                    throw new Retrycf.ValidationError(ValidationErrorType.SKUIsNotActive, `商品「${orderSKUObject.orderSKU.snapshotProduct.name}」は現在ご利用いただけません。`);
                }
            });
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Retrycf.ValidationError) {
                const validationError = error;
                orderObject.order = yield NeoTask.setInvalid(orderObject.order, validationError);
                throw new FlowError(error, orderObject.order.neoTask);
            }
            throw (error);
        }
    }));
    const validatePaymentMethod = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // 決済済みだったらスキップ
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    const stripeCard = orderObject.stripeCard;
                    const now = new Date(new Date().getFullYear(), new Date().getMonth());
                    const expiredDate = new Date(stripeCard.exp_year, stripeCard.exp_month - 1);
                    if (expiredDate < now) {
                        throw new Retrycf.ValidationError(ValidationErrorType.StripeCardExpired, 'カードの有効期限が切れています。');
                    }
                    break;
                default:
                    throw new Retrycf.ValidationError(ValidationErrorType.PaymentInfoNotFound, '決済情報が登録されていません。');
            }
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Retrycf.ValidationError) {
                const validationError = error;
                orderObject.order = yield NeoTask.setInvalid(orderObject.order, validationError);
                throw new FlowError(error, orderObject.order.neoTask);
            }
            throw (error);
        }
    }));
    const validateAndDecreaseStock = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // 決済済みだったらスキップして良い
            if (orderObject.isCharged) {
                return orderObject;
            }
            yield orderObject.updateStock(Operator.minus, 'validateAndDecreaseStock');
            return orderObject;
        }
        catch (error) {
            if (error.constructor === Retrycf.ValidationError) {
                const validationError = error;
                orderObject.order = yield NeoTask.setInvalid(orderObject.order, validationError);
                throw new FlowError(error, orderObject.order.neoTask);
            }
            throw (error);
        }
    }));
    const stripeCharge = (order) => __awaiter(this, void 0, void 0, function* () {
        return yield stripe.charges.create({
            amount: order.amount,
            currency: order.currency,
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
    });
    const payment = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            const user = orderObject.user;
            // 決済済み
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    orderObject.stripeCharge = yield stripeCharge(order);
                    break;
                default:
            }
            return orderObject;
        }
        catch (error) {
            // 在庫数を減らした後に stripe.charge が失敗したので、在庫数を元に戻す
            yield orderObject.updateStock(Operator.plus, 'payment');
            orderObject.order = yield NeoTask.clearCompleted(orderObject.order);
            if (error.constructor === StripeError) {
                const stripeError = new StripeError(error);
                orderObject.order = yield stripeError.setNeoTask(orderObject.order, 'payment');
                throw new FlowError(error, orderObject.order.neoTask);
            }
            throw (error);
        }
    }));
    /// ここでこけたらおわり、 charge が浮いている状態になる。
    const updateOrder = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const order = orderObject.order;
            // 決済済み
            if (orderObject.isCharged) {
                return orderObject;
            }
            switch (orderObject.paymentAgencyType) {
                case PaymentAgencyType.Stripe:
                    const charge = orderObject.stripeCharge;
                    order.paymentStatus = Model.OrderPaymentStatus.Paid;
                    order.stripe.chargeID = charge.id;
                    order.paidDate = FirebaseFirestore.FieldValue.serverTimestamp();
                    // FIXME: Error: Cannot encode type ([object Object]) to a Firestore Value
                    // await order.update()
                    yield order.reference.update({
                        paymentStatus: Model.OrderPaymentStatus.Paid,
                        stripe: { chargeID: charge.id },
                        paidDate: FirebaseFirestore.FieldValue.serverTimestamp(),
                        updatedAt: FirebaseFirestore.FieldValue.serverTimestamp()
                    });
                    break;
                default:
            }
            console.log('charge completed');
            return orderObject;
        }
        catch (error) {
            // ここでコケたら stripeChargeID すらわからなくなってしまうので retry もできないので fatal
            orderObject.order = yield NeoTask.setFatalAndPostToSlack(orderObject.order, 'updateOrder', error);
            throw new FlowError(error, orderObject.order.neoTask);
        }
    }));
    const updateOrderShops = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield firestore.collection(new orderObject.initializableClass.orderShop().collectionPath)
                .where('order', '==', firestore.collection(new orderObject.initializableClass.order().collectionPath).doc(orderObject.orderID))
                .get()
                .then(snapshot => {
                const batch = firestore.batch();
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
            orderObject.order = yield NeoTask.setRetry(orderObject.order, 'updateOrderShops', error);
            throw new FlowError(error, orderObject.order);
        }
    }));
    const setOrderTask = new Flow.Step((orderObject) => __awaiter(this, void 0, void 0, function* () {
        try {
            orderObject.order = yield NeoTask.setSuccess(orderObject.order);
            return orderObject;
        }
        catch (error) {
            // 失敗する可能性があるのは update の失敗だけなので retry
            orderObject.order = yield NeoTask.setRetry(orderObject.order, 'setOrderTask', error);
            throw new FlowError(error, orderObject.order);
        }
    }));
    Functions.orderPaymentRequested = (orderObject) => __awaiter(this, void 0, void 0, function* () {
        // functions.firestore.document(`version/1/order/{orderID}`).onUpdate(async event => {
        try {
            const shouldRetry = NeoTask.shouldRetry(orderObject.order);
            orderObject.order = yield NeoTask.setFatalAndPostToSlackIfRetryCountIsMax(orderObject.order);
            // status が payment requested に変更された時
            // もしくは should retry が true だった時にこの functions は実行される
            // TODO: Retry
            if (orderObject.previousOrder.paymentStatus !== orderObject.order.paymentStatus && orderObject.order.paymentStatus === Model.OrderPaymentStatus.PaymentRequested) {
                // 処理実行、リトライは実行されない
            }
            else {
                return undefined;
            }
            if (orderObject.order.paymentStatus !== Model.OrderPaymentStatus.PaymentRequested && !shouldRetry) {
                return undefined;
            }
            const flow = new Flow.Line([
                prepareRequiredData,
                validateShopIsActive,
                validateSKUIsActive,
                validatePaymentMethod,
                validateAndDecreaseStock,
                payment,
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
            if (error.constructor === Retrycf.CompletedError) {
                // 関数の重複実行エラーだった場合は task にエラーを書かずに undefined を返して処理を抜ける
                return undefined;
            }
            // FlowError としてキャッチされていない場合はここで FlowError をセット
            if (error.constructor !== FlowError) {
                yield NeoTask.setFatalAndPostToSlack(orderObject.order, 'orderPaymentRequested', error.toString());
            }
            return Promise.reject(error);
        }
    });
})(Functions = exports.Functions || (exports.Functions = {}));
